import { pickSavePath } from "@/tauri/bridge";
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileDropzone } from "@/components/FileDropzone";
import { ProgressList } from "@/components/ProgressList";
import { ToolPage } from "@/components/ToolPage";
import { SelectedFile } from "./SelectedFiles";
import { AlertNote, TextField } from "./options/fields";
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

interface CommandError {
  key?: string;
  data?: { detail?: string };
}

function errorStage(error: unknown): Extract<Stage, { kind: "error" }> {
  const err = error as CommandError;
  return { kind: "error", key: err.key ?? "internal", detail: err.data?.detail };
}

// password_invalid / password_required → re-prompt; other errors stick.
function isPasswordError(error: unknown): boolean {
  const key = (error as CommandError).key;
  return key === "password_required" || key === "password_invalid";
}

// The status line under the file: inspecting, not encrypted, error or saved.
function StageNote({ stage }: { stage: Stage }) {
  const { t } = useTranslation();
  switch (stage.kind) {
    case "detecting":
      return <p className="k-caption">{t("tools:unlock.inspecting")}</p>;
    case "ready":
      return stage.encrypted ? null : (
        <AlertNote kind="info">{t("tools:unlock.not_encrypted")}</AlertNote>
      );
    case "error":
      return (
        <AlertNote kind="error">
          {t(`errors:${stage.key}`, stage.detail ? { detail: stage.detail } : undefined)}
        </AlertNote>
      );
    case "done":
      return <AlertNote kind="success">{t("tools:unlock.saved_to", { path: stage.outputs[0] })}</AlertNote>;
    default:
      return null;
  }
}

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
    setStage(res.status === "ok" ? { kind: "ready", encrypted: res.data } : errorStage(res.error));
  }

  async function onRun() {
    if (!file) return;
    const out = await pickSavePath({
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
      return;
    }
    const failure = errorStage(res.error);
    fail(id, failure.key, failure.detail);
    setStage(isPasswordError(res.error) ? { kind: "prompt" } : failure);
  }

  const showPrompt = stage.kind === "prompt" || (stage.kind === "ready" && stage.encrypted);

  return (
    <ToolPage title={t("tools.unlock")} description={t("tools:unlock.description")}>
      <FileDropzone onFiles={onFile} multiple={false} />
      {file && <SelectedFile path={file} />}
      <StageNote stage={stage} />
      {showPrompt && (
        <TextField label={t("tools:unlock.password_label")}>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("tools:unlock.password_label")}
          />
        </TextField>
      )}
      <div className="flex items-center gap-2">
        <Button
          disabled={!file || stage.kind === "running" || stage.kind === "detecting"}
          onClick={onRun}
        >
          {t("tools:unlock.run")}
        </Button>
        {stage.kind === "prompt" && (
          <button
            type="button"
            className="k-btn k-btn-ghost k-btn-auto"
            onClick={() => setRecoveryWarningOpen(true)}
          >
            {t("tools:unlock.forgot_password")}
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
