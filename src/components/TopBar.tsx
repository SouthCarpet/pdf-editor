import { Link, useCanGoBack, useRouter, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import { useAppStore } from "@/stores/appStore";
import { useUpdateStore } from "@/stores/updateStore";
import { Button } from "@/components/ui/button";
import { ThemeSwitch } from "@/components/shell/ThemeSwitch";

type SectionPath = "/" | "/projects" | "/pipeline" | "/settings";

interface Section {
  to: SectionPath;
  /** True when the current path belongs to this section. */
  owns: (pathname: string) => boolean;
}

/** The four sections, Settings last. Tool pages belong to Tools. */
const SECTIONS: readonly Section[] = [
  { to: "/", owns: (p) => p === "/" || p.startsWith("/tools") },
  { to: "/projects", owns: (p) => p.startsWith("/projects") },
  { to: "/pipeline", owns: (p) => p.startsWith("/pipeline") },
  { to: "/settings", owns: (p) => p.startsWith("/settings") },
];

function SectionTab({ section, label, active }: { section: Section; label: string; active: boolean }) {
  return (
    <Link
      to={section.to}
      className={active ? "k-tab is-active" : "k-tab"}
      data-k-label={label}
      aria-current={active ? "page" : undefined}
      data-onboard={section.to === "/settings" ? "settings" : undefined}
    >
      {label}
    </Link>
  );
}

export function TopBar() {
  const { t, i18n } = useTranslation("common");
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const lang = i18n.resolvedLanguage === "sk" ? "sk" : "en";
  const setLanguage = useAppStore((s) => s.setLanguage);
  const updateFlag = useUpdateStore((s) => s.updateFlag);
  const labels: Record<SectionPath, string> = {
    "/": t("shell.tools_tab"),
    "/projects": t("shell.projects_tab"),
    "/pipeline": t("shell.pipeline_tab"),
    "/settings": t("settings"),
  };

  return (
    <header className="k-header shrink-0">
      <div className="k-shell">
        <Button
          variant="ghost"
          size="icon"
          className="self-center"
          aria-label={t("back")}
          title={t("back")}
          onClick={() => router.history.back()}
          disabled={!canGoBack}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Link to="/" className="k-header-name">
          {t("app_name")}
        </Link>
        <nav className="k-tabs" aria-label={t("shell.sections")}>
          {SECTIONS.map((section) => (
            <SectionTab
              key={section.to}
              section={section}
              label={labels[section.to]}
              active={section.owns(pathname)}
            />
          ))}
        </nav>
        <div className="k-header-tools">
          {updateFlag && (
            <Link to="/settings" className="k-link k-update-line" data-testid="update-line">
              {t("shell.update_available")}
            </Link>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLanguage(lang === "en" ? "sk" : "en")}
            aria-label={t("language")}
          >
            {lang.toUpperCase()}
          </Button>
          <ThemeSwitch />
        </div>
      </div>
    </header>
  );
}
