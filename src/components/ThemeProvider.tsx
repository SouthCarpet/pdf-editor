/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type Theme = "light" | "dark" | "system";

/** Kaliber's storage key. "system" is stored as no value at all. */
export const THEME_KEY = "kaliber-theme";
/** The key before Kaliber r4. Read once, then removed. */
const LEGACY_THEME_KEY = "theme";

const ThemeCtx = createContext<{ theme: Theme; setTheme: (t: Theme) => void }>({
  theme: "system",
  setTheme: () => {},
});

function isFixedTheme(value: string | null): value is "light" | "dark" {
  return value === "light" || value === "dark";
}

/** Read the saved choice. A value under the old key moves to the new key once. */
export function readStoredTheme(): Theme {
  const saved = localStorage.getItem(THEME_KEY);
  if (isFixedTheme(saved)) return saved;
  const legacy = localStorage.getItem(LEGACY_THEME_KEY);
  if (legacy === null) return "system";
  localStorage.removeItem(LEGACY_THEME_KEY);
  if (!isFixedTheme(legacy)) return "system";
  localStorage.setItem(THEME_KEY, legacy);
  return legacy;
}

function resolveTheme(theme: Theme): "light" | "dark" {
  if (theme !== "system") return theme;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Put the resolved theme on the root: `data-theme` drives the Kaliber tokens,
 * the class keeps the pre-r4 `.dark` selectors working until they are gone.
 */
export function applyTheme(theme: Theme): void {
  const root = window.document.documentElement;
  const resolved = resolveTheme(theme);
  root.classList.remove("light", "dark");
  root.classList.add(resolved);
  root.dataset.theme = resolved;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);

  useEffect(() => {
    applyTheme(theme);
    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const onChange = () => applyTheme("system");
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    }
  }, [theme]);

  const setTheme = (t: Theme) => {
    if (t === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, t);
    setThemeState(t);
  };

  return <ThemeCtx.Provider value={{ theme, setTheme }}>{children}</ThemeCtx.Provider>;
}

export const useTheme = () => useContext(ThemeCtx);
