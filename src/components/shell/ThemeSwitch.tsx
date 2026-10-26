import { useTranslation } from "react-i18next";
import { useResolvedTheme, useTheme } from "@/components/ThemeProvider";

/**
 * The quick sun and moon switch of the header tools. It flips between Light
 * and Dark; "System" stays a choice in Settings, Appearance. Both controls
 * read and write the same ThemeProvider state (key `kaliber-theme`).
 */
export function ThemeSwitch() {
  const { t } = useTranslation("common");
  const { setTheme } = useTheme();
  const dark = useResolvedTheme() === "dark";

  return (
    <label className="k-switch k-switch--theme">
      <input
        className="k-switch-input"
        type="checkbox"
        role="switch"
        checked={dark}
        onChange={(event) => setTheme(event.target.checked ? "dark" : "light")}
        aria-label={t("shell.dark_theme")}
      />
      <span className="k-switch-track" aria-hidden="true">
        <span className="k-switch-bg" />
        <span className="k-switch-thumb k-theme-part">
          <svg className="k-sun k-theme-part" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <circle cx="8" cy="8" r="3" fill="currentColor" />
            <path
              d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            />
          </svg>
          <svg className="k-moon k-theme-part" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path d="M13.2 9.6A5.6 5.6 0 0 1 6.4 2.8a5.6 5.6 0 1 0 6.8 6.8z" fill="currentColor" />
          </svg>
        </span>
      </span>
    </label>
  );
}
