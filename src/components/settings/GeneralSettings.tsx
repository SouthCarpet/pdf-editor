import { useTranslation } from "react-i18next";
import { useAppStore } from "@/stores/appStore";
import { useTheme } from "@/components/ThemeProvider";
import { Button } from "@/components/ui/button";
import { commands } from "@/bindings";

export function GeneralSettings() {
  const { t } = useTranslation(["common", "settings"]);
  const { theme, setTheme } = useTheme();
  const language = useAppStore((s) => s.language);
  const setLanguage = useAppStore((s) => s.setLanguage);

  // Delta P: shells out to explorer.exe via the open_logs_folder Tauri
  // command. We don't surface errors visually - the only way it can fail
  // is if logs_dir() can't resolve %AppData% (unlikely on Windows) or
  // spawning explorer is denied; both already produce a frontend error
  // event captured by installCrashHandlers().
  const handleOpenLogs = () => {
    void commands.openLogsFolder().catch((e) => {
      console.error("open_logs_folder failed", e);
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <label className="text-sm font-medium" htmlFor="settings-theme">
          {t("theme.label")}
        </label>
        <select
          id="settings-theme"
          className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-card)] p-2"
          value={theme}
          onChange={(e) => setTheme(e.target.value as "light" | "dark" | "system")}
        >
          <option value="light">{t("theme.light")}</option>
          <option value="dark">{t("theme.dark")}</option>
          <option value="system">{t("theme.system")}</option>
        </select>
      </div>

      <div>
        <label className="text-sm font-medium" htmlFor="settings-language">
          {t("language")}
        </label>
        <select
          id="settings-language"
          className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-card)] p-2"
          value={language}
          onChange={(e) => {
            const v = e.target.value as "en" | "sk";
            setLanguage(v);
          }}
        >
          <option value="en">English</option>
          <option value="sk">Slovenčina</option>
        </select>
      </div>

      <div>
        <Button variant="outline" onClick={handleOpenLogs}>
          {t("settings:open_logs")}
        </Button>
      </div>
    </div>
  );
}
