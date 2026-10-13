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
import { useCallback, useEffect, useMemo, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { commands, type DetectedFormField } from "@/bindings";
import { applyPrefillFills } from "@/components/workspace/prefill/applyPrefill";
import {
  formatPrefillDate,
  prefillOffer,
  shouldShowPrefillBanner,
} from "@/components/workspace/prefill/prefillOffer";
import { templateKey } from "@/components/workspace/prefill/templateHash";
import { saveDocument } from "@/lib/documentSave";
import { useAnnotations } from "@/stores/annotationsStore";
import { useFilledFields } from "@/stores/filledFieldsStore";
import { EMPTY_FILLED_FIELDS } from "@/components/workspace/filledFieldsState";
import { usePrefillStore } from "@/stores/prefillStore";
import { useWorkspace } from "@/stores/workspaceStore";

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
  pageSize?: { width: number; height: number };
  /** Plan 119 p1c: the document also has native form fields. Detection then
   * looks for the printed boxes that are not one of them. */
  hasNativeFields?: boolean;
}

const FALLBACK_PAGE_SIZE = { width: 0, height: 0 };

export function DetectFieldsSection({
  docPath,
  pageIndex,
  fields,
  onDetected,
  autoDetectHandledRef,
  pageSize,
  hasNativeFields = false,
}: Props) {
  const { t, i18n } = useTranslation("workspace");
  const annotations = useAnnotations((s) => s.byDoc[docPath]);
  const resolvedPageSize = pageSize ?? FALLBACK_PAGE_SIZE;
  const pageKey = `${docPath}\u0000${pageIndex}`;
  const filledMarks = useFilledFields((s) => s.byDoc[docPath] ?? EMPTY_FILLED_FIELDS);
  const filledIds = filledMarks.key === pageKey ? filledMarks.ids : EMPTY_FILLED_FIELDS.ids;
  const records = usePrefillStore((s) => s.records);
  const dismissed = usePrefillStore((s) => s.dismissedDocIds.includes(docPath));
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

  useEffect(() => {
    if (fields === null || fields.length === 0) return;
    usePrefillStore.getState().rememberLayout(docPath, resolvedPageSize, fields);
  }, [docPath, fields, resolvedPageSize]);

  const matchingRecord = useMemo(() => {
    if (fields === null || fields.length === 0) return undefined;
    const key = templateKey(resolvedPageSize, fields);
    return records.find((record) => record.templateKey === key);
  }, [fields, records, resolvedPageSize]);

  const showPrefill = shouldShowPrefillBanner({
    record: matchingRecord,
    fields: fields ?? [],
    filledIds,
    dismissed,
  });

  function onPrefill() {
    if (fields === null || matchingRecord === undefined) return;
    const valuesByFieldId = prefillOffer(matchingRecord, fields, filledIds);
    applyPrefillFills({
      docPath,
      pageKey,
      fields,
      valuesByFieldId,
    });
  }

  function onDismissPrefill() {
    usePrefillStore.getState().dismissOffer(docPath);
  }

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
      <p className="text-xs font-medium">
        {t(hasNativeFields ? "forms.detect_hybrid_title" : "forms.no_fields")}
      </p>
      <p className="text-[11px] leading-relaxed text-[var(--color-muted)]">
        {t(hasNativeFields ? "forms.detect_hybrid_explanation" : "forms.detect_explanation")}
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
          {showPrefill && matchingRecord !== undefined && (
            <div
              role="region"
              aria-label={t("forms.prefill_apply")}
              className="space-y-2 rounded border border-[var(--color-border)] bg-[var(--color-accent-soft)] px-2 py-2"
            >
              <p className="text-[11px] leading-relaxed text-[var(--color-accent-soft-foreground)]">
                {t("forms.prefill_banner", {
                  date: formatPrefillDate(matchingRecord.savedAt, i18n.language),
                })}
              </p>
              <div className="flex gap-2">
                <Button size="sm" onClick={onPrefill}>
                  {t("forms.prefill_apply")}
                </Button>
                <Button size="sm" variant="outline" onClick={onDismissPrefill}>
                  {t("forms.prefill_dismiss")}
                </Button>
              </div>
            </div>
          )}
          <p className="text-[10px] leading-relaxed text-[var(--color-muted)]">
            {t("forms.detect_hint")}
          </p>
          <Button
            size="sm"
            className="w-full"
            disabled={busy !== null || filledCount === 0}
            onClick={onSaveFilled}
          >
            {busy === "save"
              ? t("forms.saving")
              : t(hasNativeFields ? "forms.detect_save_all" : "forms.detect_save")}
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
