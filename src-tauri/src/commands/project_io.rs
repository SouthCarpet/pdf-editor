// Phase 15 Task 80 — Project import / export.
//
// Serializes a Project plus its files and attached pipeline presets to a
// portable `.pdf-project` JSON file. project_import is the inverse and is
// implemented as "create new project from the snapshot" — IDs are not
// preserved (the import allocates fresh ones) so the same file can be
// imported twice without collisions.
//
// File format: pretty-printed JSON, schema below. Forward-compatible: new
// fields use #[serde(default)] so older files still parse. The .pdf-project
// extension is a convention; the parser accepts any JSON file conforming to
// the ProjectExport shape.
use crate::app_state::AppState;
use crate::error::{AppError, AppResult};
use crate::persistence::pipeline_presets::{
    create_preset, get_preset, NewPipelinePreset, PipelinePreset,
};
use crate::persistence::projects::{
    add_project_file, add_project_pipeline, create_project, get_project, list_project_files,
    list_project_pipelines, NewProject, Project,
};
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct ProjectExport {
    pub project: Project,
    pub files: Vec<String>,
    pub pipelines: Vec<PipelinePreset>,
}

#[tauri::command]
#[specta::specta]
pub async fn project_export(
    state: State<'_, AppState>,
    id: i64,
    output_path: String,
) -> AppResult<()> {
    let project = get_project(&state.pool, id)
        .await?
        .ok_or_else(|| AppError::InvalidArgument {
            detail: "no such project".into(),
        })?;
    let files = list_project_files(&state.pool, id).await?;
    let pipeline_ids = list_project_pipelines(&state.pool, id).await?;
    let mut pipelines = Vec::new();
    for pid in pipeline_ids {
        if let Some(p) = get_preset(&state.pool, pid).await? {
            pipelines.push(p);
        }
    }
    let exp = ProjectExport {
        project,
        files,
        pipelines,
    };
    let bytes = serde_json::to_vec_pretty(&exp).map_err(|e| AppError::Internal {
        detail: e.to_string(),
    })?;
    tokio::fs::write(&output_path, bytes).await?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn project_import(state: State<'_, AppState>, input_path: String) -> AppResult<i64> {
    let bytes = tokio::fs::read(&input_path).await?;
    let exp: ProjectExport =
        serde_json::from_slice(&bytes).map_err(|e| AppError::InvalidArgument {
            detail: e.to_string(),
        })?;
    let new_id = create_project(
        &state.pool,
        &NewProject {
            name: exp.project.name.clone(),
            description: exp.project.description.clone(),
        },
    )
    .await?;
    for f in exp.files {
        add_project_file(&state.pool, new_id, &f).await?;
    }
    for pre in exp.pipelines {
        let pid = create_preset(
            &state.pool,
            &NewPipelinePreset {
                name: pre.name.clone(),
                description: pre.description.clone(),
                graph_json: pre.graph_json.clone(),
            },
        )
        .await?;
        add_project_pipeline(&state.pool, new_id, pid).await?;
    }
    Ok(new_id)
}
