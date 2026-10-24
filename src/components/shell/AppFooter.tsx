import { useTranslation } from "react-i18next";

/**
 * The footer of every screen: a short hint line and the Help link at the
 * same place. F1 opens the same panel (Layout owns the key).
 */
export function AppFooter({ onOpenHelp }: { onOpenHelp: () => void }) {
  const { t } = useTranslation("common");
  return (
    <footer className="k-footer shrink-0">
      <div className="k-shell py-2">
        <span>{t("shell.footer_hint")}</span>
        <nav className="k-footer-links" aria-label={t("shell.footer_nav")}>
          <button
            type="button"
            className="k-link"
            aria-haspopup="dialog"
            aria-keyshortcuts="F1"
            onClick={onOpenHelp}
          >
            {t("shell.help.link")}
          </button>
        </nav>
      </div>
    </footer>
  );
}
