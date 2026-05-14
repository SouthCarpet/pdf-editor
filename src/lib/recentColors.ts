// Per-tool recent-color memory. Persists the last 8 distinct colors a user
// picked, keyed by tool slug, in `localStorage`. Returns an array suitable
// for rendering as a row of small swatches above the color wheel.
const CAPACITY = 8;

function storageKey(toolKey: string): string {
  return `pdf-editor.recentColors.${toolKey}`;
}

export function getRecentColors(toolKey: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(toolKey));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((c): c is string => typeof c === "string").slice(0, CAPACITY);
  } catch {
    return [];
  }
}

export function pushRecentColor(toolKey: string, color: string): void {
  if (typeof window === "undefined") return;
  if (!color || color === "transparent") return;
  try {
    const current = getRecentColors(toolKey);
    const next = [color, ...current.filter((c) => c.toLowerCase() !== color.toLowerCase())].slice(
      0,
      CAPACITY,
    );
    window.localStorage.setItem(storageKey(toolKey), JSON.stringify(next));
  } catch {
    // Storage may be unavailable (quota / privacy mode); fail silently.
  }
}
