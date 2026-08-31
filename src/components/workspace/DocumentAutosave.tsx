// Plan 062 T4.3: workspace-side autosave host. Interval + blur live in
// `useDocumentAutosave`; this component also offers crash recovery with
// the same Dialog primitive as the close guard. Never auto-applies.
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { commands } from "@/bindings";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fileMtimeMs } from "@/tauri/bridge";
import { useAppStore } from "@/stores/appStore";
import {
  parseAutosaveRecord,
  restoreAutosaveRecord,
  shouldOfferRecovery,
  useDocumentAutosave,
  type AutosaveRecord,
} from "./autosave";

function formatSavedAt(savedAt: number, language: string): string {
  const locale = language === "sk" ? "sk-SK" : "en-GB";
  return new Date(savedAt).toLocaleString(locale);
}

export function DocumentAutosave({ path }: { path: string }) {
  useDocumentAutosave(path);
  const { t, i18n } = useTranslation("workspace");
  const language = useAppStore((s) => s.language);
  const [offer, setOffer] = useState<AutosaveRecord | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await commands.autosaveGet(path);
      if (cancelled) return;
      if (result.status !== "ok" || typeof result.data !== "string" || result.data.length === 0) {
        return;
      }
      const record = parseAutosaveRecord(result.data);
      if (record === null) return;
      const mtime = await fileMtimeMs(path);
      if (cancelled) return;
      if (!shouldOfferRecovery(record, mtime)) return;
      setOffer(record);
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [path]);

  function onRestore() {
    if (offer === null) return;
    restoreAutosaveRecord(path, offer);
    setOffer(null);
  }

  function onDiscard() {
    setOffer(null);
    void commands.autosaveDelete(path).catch(() => {});
  }

  const resolvedLanguage = language || i18n.language;
  const time = offer ? formatSavedAt(offer.savedAt, resolvedLanguage) : "";

  return (
    <Dialog
      open={offer !== null}
      onOpenChange={(isOpen) => {
        if (!isOpen) setOffer(null);
      }}
    >
      <DialogContent closeLabel={t("common:close")}>
        <DialogHeader>
          <DialogTitle>{t("autosave.title", { time })}</DialogTitle>
          <DialogDescription>{t("autosave.description")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onDiscard}>
            {t("autosave.discard")}
          </Button>
          <Button onClick={onRestore}>{t("autosave.restore")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
