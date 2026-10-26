// Phase 15 Task 79 - Project detail page, Kaliber r4 (plan 119 K3b).
//
// Loads the project + its files + attached pipelines. Lets the user
// rename/describe the project (inline save), attach files via the dropzone,
// detach files, attach existing pipeline presets, detach them, and trigger
// a "Run all pipelines on all files" pass that iterates files x pipelines
// via the existing pipeline_run command.
//
// Phase 15 Task 80 also adds Export/Import buttons to this page; they invoke
// project_export / project_import commands.
//
// Look: the project name is the lead (a large editable title). Files and
// attached pipelines are ruled tables with the action in its own column
// (R27, R28). Deleting asks in a dialog that names the counts (R14).
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Channel } from "@tauri-apps/api/core";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { ConfirmDeleteDialog } from "./ConfirmDeleteDialog";
import { useCountLabels } from "./useCountLabels";

interface Props {
  projectId: number;
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

/** Runs one preset on every file; returns how many files succeeded and failed. */
async function runPreset(pipeline: Pipeline, files: string[]) {
  let ok = 0;
  let fail = 0;
  for (const file of files) {
    const channel = new Channel<PipelineProgressEvent>();
    const r = await commands.pipelineRunCmd(
      { pipeline, inputs: [file], job_id: crypto.randomUUID() },
      channel,
    );
    if (r.status === "ok") ok += r.data.success;
    else fail += 1;
  }
  return { ok, fail };
}

async function loadAttached(projectId: number): Promise<PipelinePreset[]> {
  const [presets, ids] = await Promise.all([
    commands.pipelinePresetList(),
    commands.projectListPipelines(projectId),
  ]);
  if (presets.status !== "ok" || ids.status !== "ok") return [];
  const byId = new Map<number, PipelinePreset>(presets.data.map((x) => [x.id, x]));
  return ids.data.map((id) => byId.get(id)).filter((x): x is PipelinePreset => !!x);
}

export function ProjectDetail({ projectId }: Props) {
  const { t } = useTranslation("common");
  const counts = useCountLabels();
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
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Inline editing of name/description.
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [dirty, setDirty] = useState(false);

  const reload = useCallback(async () => {
    const p = await commands.projectGet(projectId);
    if (p.status !== "ok") {
      setErr(t("projects.load_failed"));
    } else if (p.data) {
      setProject(p.data);
      setEditName(p.data.name);
      setEditDescription(p.data.description ?? "");
      setDirty(false);
      setMissing(false);
    } else {
      setMissing(true);
    }
    const f = await commands.projectListFiles(projectId);
    if (f.status === "ok") setFiles(f.data);
    const ps = await commands.pipelinePresetList();
    if (ps.status === "ok") setAllPresets(ps.data);
    setAttached(await loadAttached(projectId));
  }, [projectId, t]);

  useEffect(() => {
    // Defer to a microtask so the lint rule about setState-in-effect
    // does not fire on the `.catch` error path.
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
    setConfirmDelete(false);
    const r = await commands.projectDelete(projectId);
    if (r.status === "ok") {
      await refreshList();
      navigate({ to: "/projects" });
    }
  }

  async function onRunAll() {
    if (files.length === 0 || attached.length === 0) return;
    setRunReport(null);
    setBusy(true);
    let ok = 0;
    let fail = 0;
    for (const preset of attached) {
      try {
        const done = await runPreset(presetToPipeline(preset), files);
        ok += done.ok;
        fail += done.fail;
      } catch (e) {
        fail += files.length;
        setErr(t("projects.invalid_preset", { name: preset.name, error: String(e) }));
      }
    }
    setBusy(false);
    setRunReport(t("projects.run_report", { ok, fail }));
  }

  // Task 80 - Export / Import via the project_io commands.
  async function onExport() {
    if (!project) return;
    const out = await saveDialog({
      defaultPath: `${project.name}.pdf-project`,
      filters: [{ name: t("projects.export_filter"), extensions: ["pdf-project", "json"] }],
    });
    if (!out) return;
    const r = await commands.projectExport(projectId, out);
    if (r.status === "error") setErr(JSON.stringify(r.error));
  }

  async function onImport() {
    const picked = await openDialog({
      multiple: false,
      filters: [{ name: t("projects.export_filter"), extensions: ["pdf-project", "json"] }],
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
    return <ProjectNotice message={err} missing={missing} />;
  }

  const unattachedPresets = allPresets.filter((p) => !attached.some((a) => a.id === p.id));

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <ProjectHeader
        name={editName}
        description={editDescription}
        dirty={dirty}
        busy={busy}
        files={files.length}
        pipelines={attached.length}
        onName={(v) => {
          setEditName(v);
          setDirty(true);
        }}
        onDescription={(v) => {
          setEditDescription(v);
          setDirty(true);
        }}
        onSave={onSaveMeta}
        onExport={onExport}
        onImport={onImport}
        onDelete={() => setConfirmDelete(true)}
      />

      <FilesSection files={files} onAdd={onAddFiles} onRemove={onRemoveFile} />

      <PipelinesSection
        attached={attached}
        unattached={unattachedPresets}
        presetCount={allPresets.length}
        onAttach={onAttachPipeline}
        onDetach={onDetachPipeline}
      />

      <section className="space-y-2 border-t border-[var(--color-border)] pt-4">
        <Button
          onClick={onRunAll}
          disabled={busy || files.length === 0 || attached.length === 0}
        >
          {busy ? t("running") : t("projects.run_all")}
        </Button>
        {runReport && <p className="k-caption">{runReport}</p>}
      </section>

      {err && <p className="text-sm text-[var(--color-danger)]">{err}</p>}

      <ConfirmDeleteDialog
        open={confirmDelete}
        title={t("projects.delete_title", { name: project.name })}
        body={t("projects.delete_body", {
          files: counts.files(files.length),
          pipelines: counts.pipelines(attached.length),
        })}
        onConfirm={() => void onDelete()}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

function FilesSection({
  files,
  onAdd,
  onRemove,
}: {
  files: string[];
  onAdd: (paths: string[]) => Promise<void>;
  onRemove: (path: string) => Promise<void>;
}) {
  const { t } = useTranslation("common");
  const counts = useCountLabels();
  return (
    <section className="space-y-3">
      <div className="flex items-baseline gap-3">
        <h2 className="text-lg font-semibold">{t("projects.files_heading")}</h2>
        <span className="k-caption tabular-nums">{counts.files(files.length)}</span>
      </div>
      <FileDropzone onFiles={onAdd} />
      {files.length === 0 ? (
        <p className="k-caption">{t("projects.no_files")}</p>
      ) : (
        <div className="k-table-wrap">
          <table className="k-table">
            <tbody>
              {files.map((f) => (
                <tr key={f}>
                  <td className="w-full max-w-0 truncate" title={f}>
                    {f}
                  </td>
                  <td className="k-cell-number">
                    <Button size="sm" variant="ghost" onClick={() => void onRemove(f)}>
                      {t("remove")}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function PipelinesSection({
  attached,
  unattached,
  presetCount,
  onAttach,
  onDetach,
}: {
  attached: PipelinePreset[];
  unattached: PipelinePreset[];
  presetCount: number;
  onAttach: (presetId: number) => Promise<void>;
  onDetach: (presetId: number) => Promise<void>;
}) {
  const { t } = useTranslation("common");
  const counts = useCountLabels();
  return (
    <section className="space-y-3">
      <div className="flex items-baseline gap-3">
        <h2 className="text-lg font-semibold">{t("projects.pipelines_heading")}</h2>
        <span className="k-caption tabular-nums">{counts.pipelines(attached.length)}</span>
      </div>
      {attached.length > 0 && (
        <div className="k-table-wrap">
          <table className="k-table">
            <tbody>
              {attached.map((p) => (
                <tr key={p.id}>
                  <th scope="row">{p.name}</th>
                  <td className="w-full text-[var(--color-text-muted)]">{p.description}</td>
                  <td className="k-cell-number">
                    <Button size="sm" variant="ghost" onClick={() => void onDetach(p.id)}>
                      {t("projects.detach")}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {unattached.length > 0 && (
        <div className="space-y-2">
          <p className="k-label">{t("projects.attach_preset")}</p>
          <div className="flex flex-wrap gap-2">
            {unattached.map((p) => (
              <Button key={p.id} size="sm" variant="outline" onClick={() => void onAttach(p.id)}>
                {p.name}
              </Button>
            ))}
          </div>
        </div>
      )}
      {presetCount === 0 && <p className="k-caption">{t("projects.no_presets")}</p>}
    </section>
  );
}

function ProjectNotice({ message, missing }: { message: string | null; missing: boolean }) {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  return (
    <div className="mx-auto max-w-4xl space-y-3">
      <p className="k-caption">
        {message ?? (missing ? t("projects.not_found") : t("projects.loading"))}
      </p>
      {(message || missing) && (
        <Button onClick={() => navigate({ to: "/projects" })}>
          {t("projects.back_to_projects")}
        </Button>
      )}
    </div>
  );
}

interface HeaderProps {
  name: string;
  description: string;
  dirty: boolean;
  busy: boolean;
  files: number;
  pipelines: number;
  onName: (value: string) => void;
  onDescription: (value: string) => void;
  onSave: () => void;
  onExport: () => void;
  onImport: () => void;
  onDelete: () => void;
}

function ProjectHeader(props: HeaderProps) {
  const { t } = useTranslation("common");
  const counts = useCountLabels();
  const navigate = useNavigate();
  return (
    <div>
      <button
        type="button"
        className="k-link inline-flex items-center gap-1 text-sm"
        onClick={() => navigate({ to: "/projects" })}
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        {t("projects.all_projects")}
      </button>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-2">
          <Input
            className="h-auto py-1 text-2xl font-bold"
            aria-label={t("projects.name")}
            value={props.name}
            onChange={(e) => props.onName(e.target.value)}
          />
          <Input
            aria-label={t("projects.description")}
            placeholder={t("projects.description_placeholder")}
            value={props.description}
            onChange={(e) => props.onDescription(e.target.value)}
          />
          <p className="k-caption tabular-nums">
            {t("projects.run_scope", {
              files: counts.files(props.files),
              pipelines: counts.pipelines(props.pipelines),
            })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {props.dirty && (
            <Button onClick={props.onSave} disabled={props.busy}>
              {t("save")}
            </Button>
          )}
          <Button variant="outline" onClick={props.onExport}>
            {t("projects.export")}
          </Button>
          <Button variant="outline" onClick={props.onImport}>
            {t("projects.import")}
          </Button>
          <Button variant="destructive" onClick={props.onDelete}>
            {t("delete")}
          </Button>
        </div>
      </div>
    </div>
  );
}
