// Plan 050 task D2-UX-2 (R2/R3): ask before losing unsaved work on close.
//
// One dialog serves two scopes:
//   - the whole window (registered here via the close-request listener,
//     `src/tauri/windowClose.ts` - JS-side only, no Rust change needed)
//   - a single tab (`DocumentTabs` opens the same dialog instead of
//     closing the tab directly, see `useCloseGuard`)
//
// Close flow: the listener vetoes a close only while something is
// unsaved. After "Uložiť" or "Neukladať" the state is clean, the dialog
// asks the window to close again, and that second attempt goes through.
//
// "Uložiť" runs the existing annotations save flow (`pickSavePath` +
// `apply_annotations_cmd`, the same one `EditAnnotationsPanel` and
// `DetectFieldsSection` already use) for every affected document, then
// proceeds. "Neukladať" clears the tracked unsaved state and proceeds.
// "Zrušiť" just closes the dialog - nothing else changes.
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { commands, type Annotation } from "@/bindings";
import { pickSavePath } from "@/tauri/bridge";
import { onWindowCloseRequested, requestWindowClose } from "@/tauri/windowClose";
import { NO_ANNOTATIONS, useAnnotations } from "@/stores/annotationsStore";
import { useDocuments, type DocId } from "@/stores/documentStore";
import { useCloseGuard } from "@/stores/closeGuardStore";
import { hasUnsavedWork, unsavedDocIds } from "@/lib/unsavedWork";

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

function stripClientId<T extends { __clientId: string }>(a: T): Omit<T, "__clientId"> {
  const { __clientId: _drop, ...rest } = a;
  void _drop;
  return rest;
}

/** What one document's save attempt ended in. */
type SaveOutcome = "saved" | "nothing-to-save" | "stopped";

/**
 * Runs the existing annotations save flow for one document.
 *   - "saved": nothing was pending, or the write succeeded.
 *   - "nothing-to-save": the document is dirty, but its only unsaved work
 *     is an in-progress text-run edit (Edit > Text). No command can flush
 *     that, so saving must not pretend it did - the user has to Apply the
 *     text edit first.
 *   - "stopped": the user cancelled the save dialog, or the write failed.
 */
async function saveDocument(docId: DocId): Promise<SaveOutcome> {
  const pending = useAnnotations.getState().byDoc[docId] ?? NO_ANNOTATIONS;
  if (pending.length === 0) return hasUnsavedWork(docId) ? "nothing-to-save" : "saved";
  const output = await pickSavePath({
    defaultPath: docId.replace(/\.pdf$/i, ".annotated.pdf"),
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  if (!output) return "stopped";
  const result = await commands.applyAnnotationsCmd({
    input: docId,
    output,
    annotations: pending.map(stripClientId) as Annotation[],
    job_id: crypto.randomUUID(),
  });
  return result.status === "ok" ? "saved" : "stopped";
}

function discardDocument(docId: DocId): void {
  useAnnotations.getState().clear(docId);
  useDocuments.getState().markDirty(docId, false);
}

export function CloseGuardDialog() {
  const { t } = useTranslation("workspace");
  const request = useCloseGuard((s) => s.request);
  const open = useCloseGuard((s) => s.open);
  const dismiss = useCloseGuard((s) => s.dismiss);
  const documents = useDocuments((s) => s.documents);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState(false);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    onWindowCloseRequested(() => {
      const dirty = unsavedDocIds();
      if (dirty.length === 0) return false;
      open({ kind: "window", docIds: dirty });
      return true;
    })
      .then((stop) => {
        if (disposed) stop();
        else unlisten = stop;
      })
      .catch(() => {
        // No Tauri event channel: a browser-only `vite preview`, or a test
        // that does not mock this module. The guard simply does not
        // intercept close there.
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [open]);

  if (!request) return null;

  const docIds = request.kind === "window" ? request.docIds : [request.docId];
  const names = docIds.map((id) => fileName(documents.get(id)?.path ?? id)).join(", ");

  function finish() {
    const finished = request;
    dismiss();
    if (finished?.kind === "window") void requestWindowClose();
    else if (finished?.kind === "tab") finished.onClosed();
  }

  async function onSave() {
    setBusy(true);
    setHint(false);
    try {
      for (const id of docIds) {
        const outcome = await saveDocument(id);
        if (outcome === "stopped") return;
        if (outcome === "nothing-to-save") {
          setHint(true);
          return;
        }
        discardDocument(id);
      }
      finish();
    } finally {
      setBusy(false);
    }
  }

  function onDiscard() {
    setHint(false);
    for (const id of docIds) discardDocument(id);
    finish();
  }

  return (
    <Dialog
      open
      onOpenChange={(isOpen) => {
        if (!isOpen) dismiss();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("close_guard.title")}</DialogTitle>
          <DialogDescription>{t("close_guard.description", { names })}</DialogDescription>
        </DialogHeader>
        {hint ? (
          <p className="text-sm text-muted-foreground">{t("close_guard.text_draft_hint")}</p>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={dismiss} disabled={busy}>
            {t("close_guard.cancel")}
          </Button>
          <Button variant="outline" onClick={onDiscard} disabled={busy}>
            {t("close_guard.discard")}
          </Button>
          <Button onClick={() => void onSave()} disabled={busy}>
            {busy ? t("close_guard.saving") : t("close_guard.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
