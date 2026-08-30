/** Parses the one-based page number shown in the toolbar.
 * Valid integers are clamped to the document bounds; malformed input is
 * rejected so the caller can restore the current page. */
export function parsePageInput(value: string, count: number): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed) || count < 1) return null;
  return Math.min(count, Math.max(1, Number(trimmed)));
}
