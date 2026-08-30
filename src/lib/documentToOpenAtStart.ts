/** Which recent file, if any, should open when the app starts. */
export function documentToOpenAtStart(
  setting: boolean,
  recentFiles: readonly { path: string }[],
  exists: (path: string) => boolean,
): string | null {
  if (!setting) return null;
  const first = recentFiles[0];
  if (!first) return null;
  return exists(first.path) ? first.path : null;
}
