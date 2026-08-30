/** Parses comma-separated 1-based pages and inclusive ranges into 0-based indices. */
export function parsePageRanges(text: string, count: number): Set<number> {
  const pages = new Set<number>();
  if (count <= 0) return pages;
  for (const rawPart of text.split(",")) {
    const match = /^(\d+)\s*(?:-\s*(\d+))?$/.exec(rawPart.trim());
    if (!match) continue;
    const first = Math.min(count, Math.max(1, Number(match[1])));
    const last = Math.min(count, Math.max(1, Number(match[2] ?? match[1])));
    for (let page = Math.min(first, last); page <= Math.max(first, last); page += 1) {
      pages.add(page - 1);
    }
  }
  return pages;
}
