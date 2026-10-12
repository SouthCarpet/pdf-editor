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
import { commands } from "@/bindings";
import { onWindowCloseRequested, requestWindowClose } from "@/tauri/windowClose";
import { useAnnotations } from "@/stores/annotationsStore";
import { useDocuments, type DocId } from "@/stores/documentStore";
import { useCloseGuard } from "@/stores/closeGuardStore";
import { useFilledFields } from "@/stores/filledFieldsStore";
import { hasUnsavedWork, unsavedDocIds } from "@/lib/unsavedWork";
import { saveDocument } from "@/lib/documentSave";
import { clearAnnotationFieldLinks } from "@/stores/annotationHistory";
import { historyStore } from "@/stores/historyStore";

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

async function discardDocument(docId: DocId): Promise<void> {
  // Plan 062 T4.3 R3: drop the autosave row so the next open does not
  // re-offer work the user just discarded ("Neukladať"). Await the
  // delete before the document closes; a fire-and-forget would lose the
  // IPC on window teardown.
  await Promise.resolve(commands.autosaveDelete(docId)).catch(() => {});
  useAnnotations.getState().clear(docId);
  useFilledFields.getState().clear(docId);
  historyStore.getState().clear(docId);
  clearAnnotationFieldLinks(docId);
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

  const docIds = request.kind === "tab" ? [request.docId] : request.docIds;
  const names = docIds.map((id) => fileName(documents.get(id)?.path ?? id)).join(", ");

  function finish() {
    const finished = request;
    dismiss();
    if (finished?.kind === "window") void requestWindowClose();
    else finished?.onClosed();
  }

  async function onSave() {
    setBusy(true);
    setHint(false);
    try {
      for (const id of docIds) {
        const outcome = await saveDocument(id);
        if (outcome === "cancelled" || outcome === "failed") return;
        if (outcome === "nothing-to-save") {
          setHint(true);
          return;
        }
        // "saved": saveDocument wrote the pending annotations, but a
        // document can carry a separate Edit Text draft (`dirty`) that
        // this save does not touch. Re-check before trusting the loop is
        // done, so that unsaved work never closes silently.
        if (hasUnsavedWork(id)) {
          setHint(true);
          return;
        }
      }
      finish();
    } finally {
      setBusy(false);
    }
  }

  async function onDiscard() {
    setHint(false);
    setBusy(true);
    try {
      for (const id of docIds) await discardDocument(id);
      finish();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(isOpen) => {
        if (!isOpen) dismiss();
      }}
    >
      <DialogContent closeLabel={t("common:close")}>
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
          <Button variant="outline" onClick={() => void onDiscard()} disabled={busy}>
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
