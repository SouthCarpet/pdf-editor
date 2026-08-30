/** Read a CSS custom property from `:root`. Konva cannot resolve `var(...)`. */

const HEX = /^#([\da-f]{3}|[\da-f]{6})$/i;
const RGB =
  /^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)(?:\s*[,/]\s*[\d.%]+)?\s*\)$/i;

export function readToken(name: string, fallback: string): string {
  if (typeof document === "undefined" || typeof getComputedStyle !== "function") {
    return fallback;
  }
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value === "" ? fallback : value;
}

/** Apply an alpha channel so Konva can paint a themed dim (`--color-background` at 40%). */
export function withAlpha(color: string, alpha: number): string {
  const trimmed = color.trim();
  const hex = trimmed.match(HEX);
  if (hex) {
    let digits = hex[1];
    if (digits.length === 3) {
      digits = digits[0] + digits[0] + digits[1] + digits[1] + digits[2] + digits[2];
    }
    const r = parseInt(digits.slice(0, 2), 16);
    const g = parseInt(digits.slice(2, 4), 16);
    const b = parseInt(digits.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  const rgb = trimmed.match(RGB);
  if (rgb) {
    return `rgba(${Number(rgb[1])}, ${Number(rgb[2])}, ${Number(rgb[3])}, ${alpha})`;
  }
  return trimmed;
}
