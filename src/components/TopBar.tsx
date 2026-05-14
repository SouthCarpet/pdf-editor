import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Moon, Sun, Monitor, Settings } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { useAppStore } from "@/stores/appStore";
import { Button } from "@/components/ui/button";

export function TopBar() {
  const { t } = useTranslation("common");
  const { theme, setTheme } = useTheme();
  const lang = useAppStore((s) => s.language);
  const setLanguage = useAppStore((s) => s.setLanguage);

  return (
    <header className="flex h-14 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-card)] px-4">
      <Link to="/" className="text-lg font-semibold">
        {t("app_name")}
      </Link>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLanguage(lang === "en" ? "sk" : "en")}
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
          <Button variant="ghost" size="icon" aria-label={t("settings")}>
            <Settings className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    </header>
  );
}
