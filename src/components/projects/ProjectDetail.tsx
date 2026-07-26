// Phase 15 Task 79 — Project detail page.
//
// Loads the project + its files + attached pipelines. Lets the user
// rename/describe the project (inline save), attach files via the dropzone,
// detach files, attach existing pipeline presets, detach them, and trigger
// a "Run all pipelines on all files" pass that iterates files x pipelines
// via the existing pipeline_run command.
//
// Phase 15 Task 80 also adds Export/Import buttons to this page; they invoke
// project_export / project_import commands.
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Channel } from "@tauri-apps/api/core";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { Button } from "@/components/ui/button";
import { FileDropzone } from "@/components/FileDropzone";
import {
  commands,
  type NodeKind,
  type Pipeline,
  type PipelinePreset,
  type PipelineProgressEvent,
  type Project,
} from "@/bindings";
import { payloadToRust } from "@/pipeline/nodeKinds";
import { useProjectsStore } from "@/stores/projectsStore";

interface Props {
  projectId: number;
}

export function ProjectDetail({ projectId }: Props) {
  const { t } = useTranslation("common");
  const refreshList = useProjectsStore((s) => s.refresh);
  const navigate = useNavigate();

  const [project, setProject] = useState<Project | null>(null);
  const [files, setFiles] = useState<string[]>([]);
  const [attached, setAttached] = useState<PipelinePreset[]>([]);
  const [allPresets, setAllPresets] = useState<PipelinePreset[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [runReport, setRunReport] = useState<string | null>(null);

  // Inline editing of name/description.
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [dirty, setDirty] = useState(false);

  const reload = useCallback(async () => {
    const p = await commands.projectGet(projectId);
    if (p.status === "ok") {
      if (p.data) {
        setProject(p.data);
        setEditName(p.data.name);
        setEditDescription(p.data.description ?? "");
        setDirty(false);
        setMissing(false);
      } else {
        setMissing(true);
      }
    } else {
      setErr(t("projects.load_failed"));
    }
    const f = await commands.projectListFiles(projectId);
    if (f.status === "ok") setFiles(f.data);
    const ps = await commands.pipelinePresetList();
    if (ps.status === "ok") setAllPresets(ps.data);
    const ids = await commands.projectListPipelines(projectId);
    if (ids.status === "ok" && ps.status === "ok") {
      const byId = new Map<number, PipelinePreset>(ps.data.map((x) => [x.id, x]));
      setAttached(ids.data.map((id) => byId.get(id)).filter((x): x is PipelinePreset => !!x));
    }
  }, [projectId, t]);

  useEffect(() => {
    // Defer to a microtask so the lint rule about setState-in-effect
    // doesn't fire on the `.catch` error path.
    void Promise.resolve().then(() => {
      reload().catch((e) => setErr(String(e)));
    });
  }, [reload]);

  async function onSaveMeta() {
    if (!project) return;
    setBusy(true);
    const updated: Project = {
      ...project,
      name: editName,
      description: editDescription.trim() === "" ? null : editDescription,
    };
    const r = await commands.projectUpdate(updated);
    setBusy(false);
    if (r.status === "ok") {
      setProject(updated);
      setDirty(false);
      await refreshList();
    } else {
      setErr(JSON.stringify(r.error));
    }
  }

  async function onAddFiles(paths: string[]) {
    for (const p of paths) {
      await commands.projectAddFile(projectId, p);
    }
    await reload();
  }

  async function onRemoveFile(path: string) {
    await commands.projectRemoveFile(projectId, path);
    await reload();
  }

  async function onAttachPipeline(presetId: number) {
    await commands.projectAddPipeline(projectId, presetId);
    await reload();
  }

  async function onDetachPipeline(presetId: number) {
    await commands.projectRemovePipeline(projectId, presetId);
    await reload();
  }

  async function onDelete() {
    if (!confirm(`Delete project "${project?.name}"?`)) return;
    const r = await commands.projectDelete(projectId);
    if (r.status === "ok") {
      await refreshList();
      navigate({ to: "/projects" });
    }
  }

  function presetToPipeline(preset: PipelinePreset): Pipeline {
    // Parse the editor-side DraftGraph (PipelinePresetBar's shape) into the
    // Rust-side Pipeline payload via payloadToRust per node.
    const parsed = JSON.parse(preset.graph_json) as {
      nodes: Array<{ id: string; data: { config: Parameters<typeof payloadToRust>[0] } }>;
      edges: Array<{ source: string; target: string }>;
    };
    return {
      nodes: parsed.nodes.map((n) => ({
        id: n.id,
        kind: payloadToRust(n.data.config) as unknown as NodeKind,
      })),
      edges: parsed.edges.map((e) => ({ from: e.source, to: e.target })),
    };
  }

  async function onRunAll() {
    if (files.length === 0 || attached.length === 0) return;
    setRunReport(null);
    setBusy(true);
    let ok = 0;
    let fail = 0;
    for (const preset of attached) {
      let pipeline: Pipeline;
      try {
        pipeline = presetToPipeline(preset);
      } catch (e) {
        fail += files.length;
        setErr(`Invalid pipeline preset "${preset.name}": ${String(e)}`);
        continue;
      }
      for (const _file of files) {
        const channel = new Channel<PipelineProgressEvent>();
        const r = await commands.pipelineRunCmd(
          {
            pipeline,
            inputs: [_file],
            job_id: crypto.randomUUID(),
          },
          channel,
        );
        if (r.status === "ok") ok += r.data.success;
        else fail += 1;
      }
    }
    setBusy(false);
    setRunReport(`Done: ${ok} succeeded, ${fail} failed`);
  }

  // Task 80 — Export / Import via the project_io commands.
  async function onExport() {
    if (!project) return;
    const out = await saveDialog({
      defaultPath: `${project.name}.pdf-project`,
      filters: [{ name: "PDF Project", extensions: ["pdf-project", "json"] }],
    });
    if (!out) return;
    const r = await commands.projectExport(projectId, out);
    if (r.status === "error") setErr(JSON.stringify(r.error));
  }

  async function onImport() {
    const picked = await openDialog({
      multiple: false,
      filters: [{ name: "PDF Project", extensions: ["pdf-project", "json"] }],
    });
    if (!picked || Array.isArray(picked)) return;
    const r = await commands.projectImport(picked);
    if (r.status === "ok") {
      await refreshList();
      navigate({ to: "/projects/$id", params: { id: String(r.data) } });
    } else {
      setErr(JSON.stringify(r.error));
    }
  }

  if (!project) {
    return (
      <div className="mx-auto max-w-4xl space-y-3">
        <p className="text-sm text-[var(--color-muted)]">
          {err ?? (missing ? t("projects.not_found") : t("projects.loading"))}
        </p>
        {(err || missing) && (
          <Button onClick={() => navigate({ to: "/projects" })}>
            {t("projects.back_to_projects")}
          </Button>
        )}
      </div>
    );
  }

  const unattachedPresets = allPresets.filter(
    (p) => !attached.some((a) => a.id === p.id),
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <button
          className="text-xs text-[var(--color-muted)] hover:underline"
          onClick={() => navigate({ to: "/projects" })}
        >
          ← All projects
        </button>
        <div className="mt-2 flex items-start justify-between gap-2">
          <div className="flex-1">
            <input
              className="w-full bg-transparent text-2xl font-bold focus:outline-none"
              value={editName}
              onChange={(e) => {
                setEditName(e.target.value);
                setDirty(true);
              }}
            />
            <textarea
              className="mt-1 w-full resize-none bg-transparent text-sm text-[var(--color-muted)] focus:outline-none"
              placeholder="Description (optional)"
              value={editDescription}
              rows={2}
              onChange={(e) => {
                setEditDescription(e.target.value);
                setDirty(true);
              }}
            />
          </div>
          <div className="flex flex-shrink-0 flex-col gap-1">
            {dirty && (
              <Button size="sm" onClick={onSaveMeta} disabled={busy}>
                Save
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={onExport}>
              Export
            </Button>
            <Button size="sm" variant="outline" onClick={onImport}>
              Import
            </Button>
            <Button size="sm" variant="destructive" onClick={onDelete}>
              {t("delete")}
            </Button>
          </div>
        </div>
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Files ({files.length})</h2>
        <FileDropzone onFiles={onAddFiles} />
        {files.length > 0 && (
          <ul className="divide-y divide-[var(--color-border)] rounded border border-[var(--color-border)]">
            {files.map((f) => (
              <li
                key={f}
                className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
              >
                <span className="flex-1 truncate" title={f}>
                  {f}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onRemoveFile(f)}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">
          Pipelines ({attached.length})
        </h2>
        {attached.length > 0 && (
          <ul className="divide-y divide-[var(--color-border)] rounded border border-[var(--color-border)]">
            {attached.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
              >
                <div className="flex-1">
                  <div className="font-medium">{p.name}</div>
                  {p.description && (
                    <div className="text-xs text-[var(--color-muted)]">
                      {p.description}
                    </div>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onDetachPipeline(p.id)}
                >
                  Detach
                </Button>
              </li>
            ))}
          </ul>
        )}
        {unattachedPresets.length > 0 && (
          <div className="rounded border border-[var(--color-border)] p-3">
            <p className="mb-2 text-xs text-[var(--color-muted)]">
              Attach a pipeline preset:
            </p>
            <div className="flex flex-wrap gap-1">
              {unattachedPresets.map((p) => (
                <Button
                  key={p.id}
                  size="sm"
                  variant="outline"
                  onClick={() => onAttachPipeline(p.id)}
                >
                  + {p.name}
                </Button>
              ))}
            </div>
          </div>
        )}
        {allPresets.length === 0 && (
          <p className="text-xs text-[var(--color-muted)]">
            No pipeline presets defined. Create one from the Pipeline tool first.
          </p>
        )}
      </section>

      <section className="space-y-2">
        <Button
          onClick={onRunAll}
          disabled={busy || files.length === 0 || attached.length === 0}
        >
          {busy ? "Running…" : `Run all (${files.length} × ${attached.length})`}
        </Button>
        {runReport && (
          <p className="text-sm text-[var(--color-muted)]">{runReport}</p>
        )}
      </section>

      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  );
}
