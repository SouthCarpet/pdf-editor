import { Link, useCanGoBack, useRouter } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Home, Moon, Sun, Monitor, Settings } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { useAppStore } from "@/stores/appStore";
import { useUpdateStore } from "@/stores/updateStore";
import { Button } from "@/components/ui/button";

export function TopBar() {
  const { t, i18n } = useTranslation("common");
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const lang = i18n.resolvedLanguage === "sk" ? "sk" : "en";
  const setLanguage = useAppStore((s) => s.setLanguage);
  const updateFlag = useUpdateStore((s) => s.updateFlag);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-card)] px-4">
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          aria-label={t("back")}
          title={t("back")}
          onClick={() => router.history.back()}
          disabled={!canGoBack}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Button asChild variant="ghost" size="icon" className="h-9 w-9" title={t("home")}>
          <Link to="/projects" aria-label={t("home")}>
            <Home className="h-4 w-4" />
          </Link>
        </Button>
        <Link to="/" className="ml-2 text-lg font-semibold">
          {t("app_name")}
        </Link>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLanguage(lang === "en" ? "sk" : "en")}
          aria-label={t("language")}
        >
          {lang.toUpperCase()}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() =>
            setTheme(theme === "light" ? "dark" : theme === "dark" ? "system" : "light")
          }
          aria-label={t("theme.label")}
        >
          {theme === "light" ? (
            <Sun className="h-4 w-4" />
          ) : theme === "dark" ? (
            <Moon className="h-4 w-4" />
          ) : (
            <Monitor className="h-4 w-4" />
          )}
        </Button>
        <Link to="/settings" data-onboard="settings">
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            aria-label={updateFlag ? t("settings_update_available") : t("settings")}
          >
            <Settings className="h-4 w-4" />
            {updateFlag && (
              <span
                data-testid="update-dot"
                aria-hidden="true"
                className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-[var(--color-warning)]"
              />
            )}
          </Button>
        </Link>
      </div>
    </header>
  );
}
