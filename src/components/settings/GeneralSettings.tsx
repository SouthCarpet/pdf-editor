import { useTranslation } from "react-i18next";
import { useAppStore } from "@/stores/appStore";
import { useTheme, type Theme } from "@/components/ThemeProvider";

/** Appearance: the theme as a segmented control (Light, Dark, System) and the
 * language. The header switch changes the same theme state. */
export function GeneralSettings() {
  const { t } = useTranslation(["common", "settings"]);
  const { theme, setTheme } = useTheme();
  const language = useAppStore((s) => s.language);
  const setLanguage = useAppStore((s) => s.setLanguage);

  const themes: { value: Theme; label: string }[] = [
    { value: "light", label: t("theme.light") },
    { value: "dark", label: t("theme.dark") },
    { value: "system", label: t("theme.system") },
  ];

  return (
    <section className="k-settings-section" aria-labelledby="settings-appearance">
      <h3 id="settings-appearance">{t("settings:section_appearance")}</h3>

      <div className="k-field-block">
        <span className="k-field-label" id="settings-theme-label">
          {t("theme.label")}
        </span>
        <div
          className="k-segmented self-start"
          role="radiogroup"
          aria-labelledby="settings-theme-label"
        >
          {themes.map((option) => (
            <label key={option.value} className="k-segmented-item">
              <input
                className="k-segmented-input"
                type="radio"
                name="settings-theme"
                value={option.value}
                checked={theme === option.value}
                onChange={() => setTheme(option.value)}
              />
              <span className="k-segmented-label">{option.label}</span>
            </label>
          ))}
        </div>
        <p className="k-caption">{t("settings:theme_hint")}</p>
      </div>

      <div className="k-field-block">
        <label className="k-field-label" htmlFor="settings-language">
          {t("language")}
        </label>
        <select
          id="settings-language"
          className="k-select w-full"
          value={language}
          onChange={(e) => setLanguage(e.target.value === "sk" ? "sk" : "en")}
        >
          <option value="en">English</option>
          <option value="sk">Slovenčina</option>
        </select>
      </div>
    </section>
  );
}
