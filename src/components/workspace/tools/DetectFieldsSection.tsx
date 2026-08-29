// Plan 050 task D2: the Forms panel's answer for a scanned document.
//
// A scan has no AcroForm, so the panel used to say "run OCR" and stop.
// OCR recognizes printed text; it never finds the empty boxes and lines
// the user wants to fill. This section asks the backend to look at the
// page geometry instead, and then lets the user save what they typed into
// the detected fields as one filled copy.
//
// It lives in its own file so the edit to `EditFormsPanel` stays small:
// the panel renders this in the empty-state branch and owns nothing else.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { commands, type Annotation, type DetectedFormField } from "@/bindings";
import { useAnnotations } from "@/stores/annotationsStore";
import { pickSavePath } from "@/tauri/bridge";

const DETECT_DPI = 150;

interface Props {
  docPath: string;
  pageIndex: number;
  fields: DetectedFormField[] | null;
  onDetected: (fields: DetectedFormField[]) => void;
}

export function DetectFieldsSection({ docPath, pageIndex, fields, onDetected }: Props) {
  const { t } = useTranslation("workspace");
  const annotations = useAnnotations((s) => s.byDoc[docPath]);
  const [busy, setBusy] = useState<"detect" | "save" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function onDetect() {
    setBusy("detect");
    setErr(null);
    setSaved(false);
    try {
      const result = await commands.detectScannedFormFieldsCmd(docPath, pageIndex, DETECT_DPI);
      if (result.status === "error") {
        setErr(`${t("forms.detect_error")} ${formatCommandError(result.error)}`);
        onDetected([]);
        return;
      }
      onDetected(result.data);
    } finally {
      setBusy(null);
    }
  }

  async function onSaveFilled() {
    const pending = annotations ?? [];
    if (pending.length === 0) return;
    setBusy("save");
    setErr(null);
    setSaved(false);
    try {
      const output = await pickSavePath({
        defaultPath: docPath.replace(/\.pdf$/i, ".filled.pdf"),
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
      if (!output) return;
      const result = await commands.applyAnnotationsCmd({
        input: docPath,
        output,
        annotations: pending.map(stripClientId) as Annotation[],
        job_id: crypto.randomUUID(),
      });
      if (result.status === "error") {
        setErr(t("forms.detect_error"));
        return;
      }
      setSaved(true);
    } finally {
      setBusy(null);
    }
  }

  const filledCount = annotations?.length ?? 0;

  return (
    <div className="space-y-2 border-t border-[var(--color-border)] pt-3">
      <p className="text-xs font-medium">{t("forms.no_fields")}</p>
      <p className="text-[11px] leading-relaxed text-[var(--color-muted)]">
        {t("forms.detect_explanation")}
      </p>
      <Button size="sm" className="w-full" disabled={busy !== null} onClick={onDetect}>
        {busy === "detect" ? t("forms.detecting") : t("forms.detect_fields")}
      </Button>

      {fields !== null && fields.length === 0 && busy !== "detect" && (
        <p className="text-[11px] leading-relaxed text-[var(--color-muted)]">
          {t("forms.detect_empty")}
        </p>
      )}

      {fields !== null && fields.length > 0 && (
        <>
          <p className="text-xs text-[var(--color-muted)]">
            {t("forms.detected_field_count", { count: fields.length })}
          </p>
          <p className="text-[10px] leading-relaxed text-[var(--color-muted)]">
            {t("forms.detect_hint")}
          </p>
          <Button
            size="sm"
            className="w-full"
            disabled={busy !== null || filledCount === 0}
            onClick={onSaveFilled}
          >
            {busy === "save" ? t("forms.saving") : t("forms.detect_save")}
          </Button>
        </>
      )}

      {saved && (
        <p role="status" className="text-xs text-[var(--color-success-text)]">
          {t("forms.detect_saved")}
        </p>
      )}
      {err && (
        <p role="alert" className="text-xs text-[var(--color-danger-text)]">
          {err}
        </p>
      )}
    </div>
  );
}

function stripClientId<T extends { __clientId: string }>(a: T): Omit<T, "__clientId"> {
  const { __clientId: _unused, ...rest } = a;
  void _unused;
  return rest;
}

function formatCommandError(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "data" in error &&
    typeof error.data === "object" &&
    error.data !== null &&
    "detail" in error.data &&
    typeof error.data.detail === "string"
  ) {
    return error.data.detail;
  }
  return JSON.stringify(error);
}
