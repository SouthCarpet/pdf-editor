export type MergePlacement = "before" | "after";

export function pathKey(path: string): string {
  return path.replaceAll("\\", "/").toLowerCase();
}

export function filterPdfPaths(paths: string[]): string[] {
  return paths.filter((path) => /\.pdf$/i.test(path));
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
