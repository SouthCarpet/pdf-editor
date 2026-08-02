import { save } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileDropzone } from "@/components/FileDropzone";
import { ProgressList } from "@/components/ProgressList";
import { ToolPage } from "@/components/ToolPage";
import { RecoveryWarningModal } from "@/components/recovery/RecoveryWarningModal";
import { commands } from "@/bindings";
import { useJobsStore } from "@/stores/jobsStore";

type Stage =
  | { kind: "idle" }
  | { kind: "detecting" }
  | { kind: "ready"; encrypted: boolean }
  | { kind: "prompt" }
  | { kind: "running" }
  | { kind: "done"; outputs: string[] }
  | { kind: "error"; key: string; detail?: string };

export function UnlockTool() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [file, setFile] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [recoveryWarningOpen, setRecoveryWarningOpen] = useState(false);
  const { start, finish, fail } = useJobsStore();

  async function onFile(paths: string[]) {
    const f = paths[0] ?? null;
    setFile(f);
    setStage({ kind: "idle" });
    setPassword("");
    if (!f) return;
    setStage({ kind: "detecting" });
    const res = await commands.detectPdfEncryption(f);
    if (res.status === "ok") {
      setStage({ kind: "ready", encrypted: res.data });
    } else {
      const err = res.error as { key?: string; data?: { detail?: string } };
      setStage({ kind: "error", key: err.key ?? "internal", detail: err.data?.detail });
    }
  }

  async function onRun() {
    if (!file) return;
    const out = await save({
      filters: [{ name: "PDF", extensions: ["pdf"] }],
      defaultPath: "unlocked.pdf",
    });
    if (!out) return;
    const id = crypto.randomUUID();
    start(id, "unlock", [file]);
    setStage({ kind: "running" });
    const res = await commands.unlockPdfCmd({
      input: file,
      output: out,
      password: password || null,
      job_id: id,
    });
    if (res.status === "ok") {
      if (res.data.type === "ok") {
        setStage({ kind: "done", outputs: res.data.output_paths });
        finish(id, res.data.output_paths);
      } else {
        setStage({ kind: "prompt" });
      }
    } else {
      const err = res.error as { key?: string; data?: { detail?: string } };
      fail(id, err.key ?? "internal", err.data?.detail);
      // password_invalid / password_required → re-prompt; other errors stick.
      if (err.key === "password_required" || err.key === "password_invalid") {
        setStage({ kind: "prompt" });
      } else {
        setStage({ kind: "error", key: err.key ?? "internal", detail: err.data?.detail });
      }
    }
  }

  const encrypted = stage.kind === "ready" && stage.encrypted;
  const showPrompt = stage.kind === "prompt" || encrypted;

  return (
    <ToolPage
      title={t("tools.unlock")}
      description={t("tools:unlock.description")}
    >
      <FileDropzone onFiles={onFile} multiple={false} />
      {file && <div className="truncate rounded border p-2 text-sm">{file}</div>}
      {stage.kind === "detecting" && (
        <p className="text-sm text-[var(--color-muted)]">Inspecting…</p>
      )}
      {stage.kind === "ready" && !stage.encrypted && (
        <p className="text-sm text-[var(--color-success-text)]">This PDF is not encrypted.</p>
      )}
      {showPrompt && (
        <div className="space-y-2">
          <label className="text-sm">Password</label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter password"
          />
        </div>
      )}
      {stage.kind === "error" && (
        <p className="text-sm text-[var(--color-danger-text)]">
          {t(`errors:${stage.key}`, stage.detail ? { detail: stage.detail } : undefined)}
        </p>
      )}
      {stage.kind === "done" && (
        <p className="text-sm text-[var(--color-success-text)]">Saved to {stage.outputs[0]}</p>
      )}
      <div className="flex items-center gap-2">
        <Button
          disabled={!file || stage.kind === "running" || stage.kind === "detecting"}
          onClick={onRun}
        >
          {t("ok")}
        </Button>
        {stage.kind === "prompt" && (
          <button
            className="text-xs text-[var(--color-accent)] underline hover:text-[var(--color-accent-hover)]"
            onClick={() => setRecoveryWarningOpen(true)}
          >
            Forgot the password? Try recovery →
          </button>
        )}
      </div>
      <ProgressList />
      <RecoveryWarningModal
        open={recoveryWarningOpen}
        onCancel={() => setRecoveryWarningOpen(false)}
        onConfirm={() => {
          setRecoveryWarningOpen(false);
          navigate({
            to: "/tools/unlock/recovery",
            search: file ? { input: file } : {},
          });
        }}
      />
    </ToolPage>
  );
}
