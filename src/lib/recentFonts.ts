// Recent-fonts memory. Persists the last 5 distinct font families a user
// picked, in `localStorage`. Returns an array suitable for rendering as a
// "Recent" section in the FontPicker combobox.
const CAPACITY = 5;
const STORAGE_KEY = "pdf-editor.recentFonts";

export function getRecentFonts(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((f): f is string => typeof f === "string").slice(0, CAPACITY);
  } catch {
    return [];
  }
}

export function pushRecentFont(family: string): void {
  if (typeof window === "undefined") return;
  if (!family) return;
  try {
    const current = getRecentFonts();
    const next = [
      family,
      ...current.filter((f) => f.toLowerCase() !== family.toLowerCase()),
    ].slice(0, CAPACITY);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable (quota / privacy mode): fail silently.
  }
}
