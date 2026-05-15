// Phase 14 Task 77 — Pipeline run commands.
//
// Two entry points:
//
//   * `pipeline_run_cmd`         — run a pipeline over an explicit list
//                                  of input PDFs (e.g. "Run on files").
//   * `pipeline_run_on_folder_cmd` — walk a directory (depth ≤ 2) for
//                                    *.pdf and run the pipeline over each
//                                    file independently. Per-file errors
//                                    do not abort the run.
//
// Both register a CancellationToken under `args.job_id`, emit
// ProgressReporter events on the global event channel, and return a
// `PipelineRunReport` carrying output paths, per-file errors, and the
// Delta Y preflight warnings the editor renders inline.
use crate::app_state::AppState;
use crate::error::{AppError, AppResult};
use crate::pipeline::dag::{NodeError, Pipeline, PipelineRunReport};
use crate::pipeline::executor::{preflight_warnings, run_pipeline};
use crate::util::progress::{ProgressEvent, ProgressReporter};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::ipc::Channel;
use tauri::State;
use tokio::sync::mpsc;

/// Specta-friendly progress event for the pipeline channel.
///
/// `ProgressEvent` in `util::progress` carries a `serde_json::Value` for
/// `Done.result`, which makes its `specta::Type` derive recurse without
/// bound. The pipeline run report is shaped — we don't need free-form
/// JSON on the wire here — so this enum carries `ratio` + `label` for
/// progress, a plain string detail for Done, and `{key, detail}` for
/// errors.
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum PipelineProgressEvent {
    Started {
        job_id: String,
        label: Option<String>,
    },
    Progress {
        job_id: String,
        ratio: f32,
        label: Option<String>,
    },
    Done {
        job_id: String,
        message: Option<String>,
    },
    Error {
        job_id: String,
        key: String,
        detail: Option<String>,
    },
}

impl PipelineProgressEvent {
    fn from_internal(ev: ProgressEvent) -> Self {
        match ev {
            ProgressEvent::Started { job_id, label } => Self::Started { job_id, label },
            ProgressEvent::Progress {
                job_id,
                ratio,
                label,
            } => Self::Progress {
                job_id,
                ratio,
                label,
            },
            ProgressEvent::Done { job_id, result } => Self::Done {
                job_id,
                message: result.map(|v| match v {
                    serde_json::Value::String(s) => s,
                    other => other.to_string(),
                }),
            },
            ProgressEvent::Error {
                job_id,
                key,
                detail,
            } => Self::Error {
                job_id,
                key,
                detail,
            },
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize, specta::Type)]
pub struct PipelineRunArgs {
    pub pipeline: Pipeline,
    pub inputs: Vec<String>,
    pub job_id: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, specta::Type)]
pub struct PipelineRunFolderArgs {
    pub pipeline: Pipeline,
    pub folder: String,
    pub job_id: String,
}

/// Pump the internal mpsc::Receiver into the Tauri Channel. The channel
/// is created per-call by the frontend; events go through the typed
/// `PipelineProgressEvent` so the bindings generator can produce a
/// matching union without falling into the serde_json::Value recursion.
async fn pump(
    mut rx: mpsc::Receiver<crate::util::progress::ProgressEvent>,
    out: Channel<PipelineProgressEvent>,
) {
    while let Some(ev) = rx.recv().await {
        let _ = out.send(PipelineProgressEvent::from_internal(ev));
    }
}

#[tauri::command]
#[specta::specta]
pub async fn pipeline_run_cmd(
    state: State<'_, AppState>,
    args: PipelineRunArgs,
    on_event: Channel<PipelineProgressEvent>,
) -> AppResult<PipelineRunReport> {
    let warnings = preflight_warnings(&args.pipeline);

    // Register a cancellation token under this job id so the frontend
    // (or the user) can call cancel_job(job_id) to stop the run mid-way.
    let token = state.cancellation.register(&args.job_id);

    let (tx, rx) = mpsc::channel(64);
    let reporter = ProgressReporter::new(args.job_id.clone(), tx);
    let pump_handle = tokio::spawn(pump(rx, on_event));

    let inputs: Vec<PathBuf> = args.inputs.iter().map(PathBuf::from).collect();

    let result = run_pipeline(&state, &args.pipeline, &inputs, &reporter, token.clone()).await;

    state.cancellation.forget(&args.job_id);

    let mut report = PipelineRunReport {
        warnings,
        ..PipelineRunReport::default()
    };

    match result {
        Ok(outs) => {
            report.success = 1;
            report.output_paths = outs.into_iter().map(|p| p.display().to_string()).collect();
            reporter
                .done(Some(serde_json::Value::String(format!(
                    "wrote {} outputs",
                    report.output_paths.len()
                ))))
                .await;
        }
        Err(e) => {
            report.failed = 1;
            report.errors.push(NodeError {
                input: args.inputs.first().cloned().unwrap_or_default(),
                message: format!("{e}"),
            });
            reporter
                .error(e.key().to_string(), Some(format!("{e}")))
                .await;
        }
    }
    // Drain remaining events before returning so the channel doesn't
    // close mid-send.
    drop(reporter);
    let _ = pump_handle.await;
    Ok(report)
}

#[tauri::command]
#[specta::specta]
pub async fn pipeline_run_on_folder_cmd(
    state: State<'_, AppState>,
    args: PipelineRunFolderArgs,
    on_event: Channel<PipelineProgressEvent>,
) -> AppResult<PipelineRunReport> {
    let warnings = preflight_warnings(&args.pipeline);
    let token = state.cancellation.register(&args.job_id);

    let folder = std::path::Path::new(&args.folder);
    if !folder.exists() {
        state.cancellation.forget(&args.job_id);
        return Err(AppError::FileNotFound {
            path: args.folder.clone(),
        });
    }

    let mut inputs: Vec<PathBuf> = Vec::new();
    for entry in walkdir::WalkDir::new(folder)
        .max_depth(2)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if entry.file_type().is_file()
            && entry
                .path()
                .extension()
                .and_then(|x| x.to_str())
                .map(|s| s.eq_ignore_ascii_case("pdf"))
                .unwrap_or(false)
        {
            inputs.push(entry.path().to_path_buf());
        }
    }

    let (tx, rx) = mpsc::channel(256);
    let reporter = ProgressReporter::new(args.job_id.clone(), tx);
    let pump_handle = tokio::spawn(pump(rx, on_event));

    let mut report = PipelineRunReport {
        warnings,
        ..PipelineRunReport::default()
    };

    if inputs.is_empty() {
        reporter
            .done(Some(serde_json::Value::String(
                "no pdf files found in folder".into(),
            )))
            .await;
        state.cancellation.forget(&args.job_id);
        drop(reporter);
        let _ = pump_handle.await;
        return Ok(report);
    }

    reporter
        .started(Some(format!("processing {} files", inputs.len())))
        .await;

    let total = inputs.len() as f32;
    for (idx, input) in inputs.iter().enumerate() {
        if token.is_cancelled() {
            report.errors.push(NodeError {
                input: input.display().to_string(),
                message: "cancelled".into(),
            });
            report.failed += 1;
            continue;
        }
        reporter
            .progress(
                idx as f32 / total,
                Some(format!(
                    "[{}/{}] {}",
                    idx + 1,
                    inputs.len(),
                    input.file_name().and_then(|s| s.to_str()).unwrap_or("")
                )),
            )
            .await;
        // Each file gets its own sub-reporter that funnels into the same
        // mpsc; the executor uses ratios relative to the local pipeline,
        // so we tag the label with the file context for display.
        let result = run_pipeline(
            &state,
            &args.pipeline,
            std::slice::from_ref(input),
            &reporter,
            token.clone(),
        )
        .await;
        match result {
            Ok(outs) => {
                report.success += 1;
                report
                    .output_paths
                    .extend(outs.into_iter().map(|p| p.display().to_string()));
            }
            Err(e) => {
                report.failed += 1;
                report.errors.push(NodeError {
                    input: input.display().to_string(),
                    message: format!("{e}"),
                });
            }
        }
    }

    state.cancellation.forget(&args.job_id);
    reporter
        .done(Some(serde_json::Value::String(format!(
            "success={} failed={}",
            report.success, report.failed
        ))))
        .await;
    drop(reporter);
    let _ = pump_handle.await;
    Ok(report)
}
