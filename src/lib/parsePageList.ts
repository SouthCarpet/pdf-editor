// Parse a comma-separated page list with hyphen ranges (e.g. "1,3,5-7") into
// a sorted, de-duplicated array of 1-based page numbers. Returns null when
// the input is malformed or contains a number outside 1..=max.
//
// Examples:
//   parsePageList("1,3,5-7", 10) => [1, 3, 5, 6, 7]
//   parsePageList("2-1",     10) => [1, 2]   // tolerant of reversed range
//   parsePageList("1,12",    10) => null     // out of range
//   parsePageList("abc",      10) => null
export function parsePageList(input: string, max: number): number[] | null {
  if (!input.trim()) return null;
  const out = new Set<number>();
  const parts = input.split(",").map((p) => p.trim()).filter(Boolean);
  for (const part of parts) {
    if (part.includes("-")) {
      const [aStr, bStr] = part.split("-").map((s) => s.trim());
      const a = Number(aStr);
      const b = Number(bStr);
      if (!Number.isInteger(a) || !Number.isInteger(b)) return null;
      if (a < 1 || b < 1 || a > max || b > max) return null;
      const [lo, hi] = a <= b ? [a, b] : [b, a];
      for (let i = lo; i <= hi; i++) out.add(i);
    } else {
      const n = Number(part);
      if (!Number.isInteger(n) || n < 1 || n > max) return null;
      out.add(n);
    }
  }
  if (out.size === 0) return null;
  return Array.from(out).sort((a, b) => a - b);
}
