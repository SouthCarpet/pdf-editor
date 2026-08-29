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
import { useCallback, useEffect, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { commands, type DetectedFormField } from "@/bindings";
import { useAnnotations } from "@/stores/annotationsStore";
import { useWorkspace } from "@/stores/workspaceStore";
import { saveDocument } from "@/lib/documentSave";

const DETECT_DPI = 150;

interface Props {
  docPath: string;
  pageIndex: number;
  fields: DetectedFormField[] | null;
  onDetected: (fields: DetectedFormField[]) => void;
  // Plan 050 task D2-UX-2 (R7a): the last `autoDetectFormsRequest` value
  // this Forms tab already acted on. Owned by `Workspace` (which does not
  // unmount when the Edit sub-tool changes) and threaded down through
  // `EditFormsPanel`, rather than a ref created here: a ref created in
  // this component dies with it, so switching away from Forms and back
  // reset the dedup and re-ran detection for a request already consumed.
  autoDetectHandledRef: RefObject<number>;
}

export function DetectFieldsSection({
  docPath,
  pageIndex,
  fields,
  onDetected,
  autoDetectHandledRef,
}: Props) {
  const { t } = useTranslation("workspace");
  const annotations = useAnnotations((s) => s.byDoc[docPath]);
  const [busy, setBusy] = useState<"detect" | "save" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const onDetect = useCallback(async () => {
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
  }, [docPath, pageIndex, onDetected, t]);

  // Plan 050 task D2-UX (R4): the Text tool's "Nájsť polia" action switches
  // to this sub-tool AND runs detection, by incrementing a counter in the
  // workspace store. `autoDetectHandledRef` (see the prop doc above) is
  // what makes this a one-shot per request even across the remount that
  // switching sub-tool and back causes (R7a, plan 050 D2-UX-2).
  const autoDetectRequest = useWorkspace((s) => s.autoDetectFormsRequest);
  useEffect(() => {
    if (autoDetectRequest === 0 || autoDetectRequest === autoDetectHandledRef.current) return;
    autoDetectHandledRef.current = autoDetectRequest;
    void onDetect();
  }, [autoDetectRequest, autoDetectHandledRef, onDetect]);

  async function onSaveFilled() {
    const pending = annotations ?? [];
    if (pending.length === 0) return;
    setBusy("save");
    setErr(null);
    setSaved(false);
    try {
      const outcome = await saveDocument(docPath);
      if (outcome === "cancelled" || outcome === "nothing-to-save") return;
      if (outcome === "failed") {
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
