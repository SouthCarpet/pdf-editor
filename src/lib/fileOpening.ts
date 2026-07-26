export type MergePlacement = "before" | "after";

function pathKey(path: string): string {
  return path.replaceAll("\\", "/").toLowerCase();
}

export function normalizePdfPaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const pdfs: string[] = [];

  for (const path of paths) {
    if (!/\.pdf$/i.test(path)) continue;
    const key = pathKey(path);
    if (seen.has(key)) continue;
    seen.add(key);
    pdfs.push(path);
  }

  return pdfs;
}

export function movePath(paths: string[], from: number, to: number): string[] {
  if (from === to || from < 0 || to < 0 || from >= paths.length || to >= paths.length) {
    return paths;
  }
  const next = [...paths];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export function composeMergeInputs(
  orderedPaths: string[],
  activePath: string | null,
  placement: MergePlacement
): string[] {
  if (!activePath || orderedPaths.some((path) => pathKey(path) === pathKey(activePath))) {
    return orderedPaths;
  }
  return placement === "before" ? [...orderedPaths, activePath] : [activePath, ...orderedPaths];
}
