import { useTranslation } from "react-i18next";
import { useAppStore } from "@/stores/appStore";
import { useTheme } from "@/components/ThemeProvider";

export function GeneralSettings() {
  const { t, i18n } = useTranslation("common");
  const { theme, setTheme } = useTheme();
  const language = useAppStore((s) => s.language);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const privacyStrict = useAppStore((s) => s.privacyStrict);
  const setPrivacy = useAppStore((s) => s.setPrivacy);

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
            void i18n.changeLanguage(v);
          }}
        >
          <option value="en">English</option>
          <option value="sk">Slovenčina</option>
        </select>
      </div>

      <div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={privacyStrict}
            onChange={(e) => setPrivacy(e.target.checked)}
          />
          Strict privacy mode (block all network calls)
        </label>
      </div>
    </div>
  );
}
