import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDocuments } from "@/stores/documentStore";
import { resolveShortcut, shortcutFocus } from "./shortcuts";

export function PrintShortcutStatus() {
  const { t } = useTranslation("workspace");
  const activeDocId = useDocuments((state) => state.activeDocId);
  const [visible, setVisible] = useState(false);
  const timeout = useRef<number | null>(null);

  useEffect(() => {
    if (activeDocId !== null) return;

    function onKeyDown(event: KeyboardEvent) {
      if (resolveShortcut(event, shortcutFocus(event.target))?.type !== "print") return;
      event.preventDefault();
      setVisible(true);
      if (timeout.current !== null) window.clearTimeout(timeout.current);
      timeout.current = window.setTimeout(() => setVisible(false), 2500);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (timeout.current !== null) window.clearTimeout(timeout.current);
    };
  }, [activeDocId]);

  if (!visible || activeDocId !== null) return null;
  return (
    <p
      role="status"
      className="k-toast fixed right-4 bottom-4 z-40 rounded-[var(--radius-lg)] border border-[var(--color-border-strong)] bg-[var(--color-surface-raised)] text-xs text-[var(--color-text-muted)]"
    >
      {t("print.no_document")}
    </p>
  );
}
