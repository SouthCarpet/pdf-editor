// Phase 12 Task 68: Edit Tier 3 (real inline text edit, Delta S).
//
// Workflow: enumerate text runs via extract_runs_cmd, let the user pick a
// run + type new text. Save invokes replace_run_cmd which performs the
// real in-place Tj/TJ rewrite with original styling preserved. If the font
// encoding cannot be inverted (EncodingMismatch), the panel surfaces a
// clear banner and offers the explicit redaction-style fallback as a
// separate button (never auto-substituted).
import { useEffect, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { commands, type TextRun } from "@/bindings";
import { useAutosave } from "@/hooks/useAutosave";
import { useDocuments } from "@/stores/documentStore";
import { useWorkspace } from "@/stores/workspaceStore";

interface Props {
  docPath: string;
}

interface RunEdit {
  newText: string;
}

export function EditTextPanel({ docPath }: Props) {
  const { t } = useTranslation("common");
  const setEditSubTool = useWorkspace((s) => s.setEditSubTool);
  const requestAutoDetectForms = useWorkspace((s) => s.requestAutoDetectForms);
  const openOcrPrompt = useWorkspace((s) => s.openOcrPrompt);
  // Combined fetch state - single useState avoids cascading effect-setState.
  const [docState, setDocState] = useState<{
    path: string;
    runs: TextRun[];
    loading: boolean;
  }>({ path: docPath, runs: [], loading: true });
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [edit, setEdit] = useState<RunEdit>({ newText: "" });
  const [lastSelectedKey, setLastSelectedKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showRedactionFallback, setShowRedactionFallback] = useState(false);
  // Plan 050 task D2-UX-2 (R1): typed-but-not-yet-Applied text is real
  // unsaved work - closing the app or the tab must not lose it silently.
  // Reported into `documentStore.dirty`, the generic "other unsaved edit"
  // source `hasUnsavedWork` already reads, since Apply always writes a new
  // output file rather than mutating the currently open document in place
  // (same as the annotations flows this task also guards).
  const [textDraftDirty, setTextDraftDirty] = useState(false);
  const markDirty = useDocuments((s) => s.markDirty);
  // Delta W §4: when the user wants to add text where there is no
  // editable run, show a popover offering to switch to the annotations
  // sub-tool (FreeText) at the click location.
  const [showEmptyAreaPrompt, setShowEmptyAreaPrompt] = useState(false);
  // Plan 050 task D2-UX (R4): whether this document has no text layer at
  // all, so "no editable text runs" can say why instead of just stating it.
  const [scanState, setScanState] = useState<{ path: string; isScanned: boolean }>({
    path: docPath,
    isScanned: false,
  });

  // Reset state inline (not in an effect) when docPath changes.
  if (docState.path !== docPath) {
    setDocState({ path: docPath, runs: [], loading: true });
    setSelectedIndex(null);
    setLastSelectedKey(null);
    setTextDraftDirty(false);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await commands.extractRunsCmd(docPath);
      if (cancelled) return;
      if (r.status === "ok") {
        setDocState({ path: docPath, runs: r.data, loading: false });
      } else {
        setErr(JSON.stringify(r.error));
        setDocState({ path: docPath, runs: [], loading: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [docPath]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await commands.detectScannedPdf(docPath);
      if (cancelled) return;
      setScanState({ path: docPath, isScanned: r.status === "ok" && r.data.is_likely_scanned });
    })();
    return () => {
      cancelled = true;
    };
  }, [docPath]);

  useEffect(() => {
    markDirty(docPath, textDraftDirty);
    return () => {
      markDirty(docPath, false);
    };
  }, [docPath, textDraftDirty, markDirty]);

  const isScanned = scanState.path === docPath && scanState.isScanned;

  function onFindFields() {
    setEditSubTool("forms");
    requestAutoDetectForms();
  }

  useAutosave(docPath, { tool: "text", selectedIndex, edit }, 5000);

  const runs = docState.runs;
  const loading = docState.loading;
  const selected = selectedIndex !== null ? runs[selectedIndex] : null;
  // Sync the edit state when the user changes selection - derived inline,
  // not via an effect.
  const selectedKey = selected ? `${selected.page}-${selected.operator_index}` : null;
  if (selectedKey !== lastSelectedKey) {
    setLastSelectedKey(selectedKey);
    setEdit({ newText: selected?.text ?? "" });
    setShowRedactionFallback(false);
    setTextDraftDirty(false);
  }

  async function onApply() {
    if (selected === null || !edit.newText) return;
    setBusy(true);
    setErr(null);
    try {
      const out = await save({
        defaultPath: docPath.replace(/\.pdf$/i, ".edited.pdf"),
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
      if (!out) return;
      const r = await commands.replaceRunCmd({
        input: docPath,
        output: out,
        page_index: selected.page,
        operator_index: selected.operator_index,
        new_text: edit.newText,
        job_id: crypto.randomUUID(),
      });
      if (r.status === "error") {
        const e = r.error as { key: string; data: { detail?: string } };
        setErr(e.data?.detail ?? JSON.stringify(e));
        if (e.key === "encoding_mismatch") setShowRedactionFallback(true);
      } else {
        setTextDraftDirty(false);
      }
    } finally {
      setBusy(false);
    }
  }

  async function onApplyRedaction() {
    if (selected === null || !edit.newText) return;
    setBusy(true);
    setErr(null);
    try {
      const out = await save({
        defaultPath: docPath.replace(/\.pdf$/i, ".edited.pdf"),
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
      if (!out) return;
      const r = await commands.replaceRunRedactionCmd({
        input: docPath,
        output: out,
        page_index: selected.page,
        rect: selected.bbox,
        new_text: edit.newText,
        font_size: selected.font_size,
        job_id: crypto.randomUUID(),
      });
      if (r.status === "error") setErr(JSON.stringify(r.error));
      else setTextDraftDirty(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium">
        {t("tools.edit")}: {t("workspace:tools.edit_text")}
      </h3>
      <p className="text-xs text-[var(--color-muted)]">
        Pick a text run from the page, edit it, and save. The original styling is preserved with no
        layout shift.
      </p>

      <div className="max-h-[200px] overflow-auto rounded border border-[var(--color-border)]">
        {loading && <p className="px-2 py-1 text-xs text-[var(--color-muted)]">Loading runs…</p>}
        {!loading && runs.length === 0 && !isScanned && (
          <p className="px-2 py-1 text-xs text-[var(--color-muted)]">
            {t("workspace:edit_text.no_runs")}
          </p>
        )}
        {!loading && runs.length === 0 && isScanned && (
          <div className="space-y-2 p-2">
            <p className="text-xs font-medium">{t("workspace:edit_text.scanned_title")}</p>
            <p className="text-[11px] leading-relaxed text-[var(--color-muted)]">
              {t("workspace:edit_text.scanned_explanation")}
            </p>
            <div className="flex gap-1">
              <Button size="sm" onClick={onFindFields}>
                {t("workspace:edit_text.find_fields")}
              </Button>
              <Button size="sm" variant="outline" onClick={openOcrPrompt}>
                {t("workspace:edit_text.run_ocr")}
              </Button>
            </div>
          </div>
        )}
        {runs.map((r, i) => (
          <button
            key={`${r.page}-${r.operator_index}`}
            onClick={() => setSelectedIndex(i)}
            className={`block w-full truncate px-2 py-1 text-left text-xs hover:bg-[var(--color-control-hover)] ${
              selectedIndex === i
                ? "bg-[var(--color-accent-soft)] text-[var(--color-accent-soft-foreground)]"
                : ""
            }`}
            title={r.font}
          >
            <span className="text-[var(--color-muted)]">p{r.page + 1}</span> {r.text.slice(0, 60)}
          </button>
        ))}
      </div>

      {selected && (
        <>
          <label className="block text-xs">
            <span className="text-[var(--color-muted)]">New text</span>
            <input
              type="text"
              value={edit.newText}
              onChange={(e) => {
                setEdit({ newText: e.target.value });
                setTextDraftDirty(true);
              }}
              className="mt-1 block w-full rounded border border-[var(--color-border)] bg-[var(--color-card)] px-2 py-1"
            />
          </label>
          <p className="text-[10px] text-[var(--color-muted)]">
            Font: {selected.font} ({(selected.font_size ?? 12).toFixed(1)}pt)
          </p>
          <Button size="sm" disabled={busy || !edit.newText} onClick={onApply} className="w-full">
            {busy ? "Applying…" : "Apply (preserve styling)"}
          </Button>
          {showRedactionFallback && (
            <div className="rounded border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-2 text-[11px] text-[var(--color-warning-soft-foreground)]">
              <p className="font-medium">Cannot invert this font's encoding.</p>
              <p>
                The font does not expose a /ToUnicode CMap and is not in WinAnsi or MacRoman.
                Falling back to redaction will paint a white rectangle and overlay new text in
                Helvetica. Layout may shift.
              </p>
              <Button size="sm" variant="outline" onClick={onApplyRedaction} className="mt-1">
                Use redaction-style replacement
              </Button>
            </div>
          )}
        </>
      )}
      {/* Delta W §4: click-on-empty-area workflow.
          When no run is selected (either none picked yet, or user wants to
          add new text), offer to switch to annotations + FreeText. */}
      {selected === null && !loading && (
        <div className="space-y-2 border-t border-[var(--color-border)] pt-3">
          <p className="text-[11px] text-[var(--color-muted)]">
            No editable text here? You can add a free-text annotation instead.
          </p>
          {!showEmptyAreaPrompt ? (
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={() => setShowEmptyAreaPrompt(true)}
            >
              {t("workspace:edit_text.add_new_text")}
            </Button>
          ) : (
            <div className="rounded border border-[var(--color-focus)] bg-[var(--color-accent-soft)] p-2 text-[11px] text-[var(--color-accent-soft-foreground)]">
              <p className="font-medium">No editable text here</p>
              <p className="mb-2">Switch to Annotations to add a new FreeText box.</p>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  onClick={() => {
                    setShowEmptyAreaPrompt(false);
                    setEditSubTool("annotations");
                  }}
                >
                  Add FreeText annotation
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowEmptyAreaPrompt(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {err && <p className="text-xs text-[var(--color-danger-text)]">{err}</p>}
    </div>
  );
}
