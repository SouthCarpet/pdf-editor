// Phase 12 Task 69 - Autosave hook + helpers.
//
// Wired into the Edit panels (Forms / Annotations / Text). Each panel calls
// `useAutosave(docPath, currentState, 5000)` so unsaved edits persist to
// SQLite every 5 seconds.  On workspace mount, callers use `loadAutosave`
// to offer restoration; on successful save-to-disk or explicit discard
// they call `clearAutosave`.
import { commands } from "@/bindings";

export function useAutosave(
  _docPath: string | null,
  _patch: unknown,
  _intervalMs = 5000,
) {
  // Plan 062 T4.3: pending-fill autosave is owned by
  // `src/components/workspace/autosave.ts` (versioned `{ v: 1, ... }`
  // payload, dirty + blur scheduler, recovery dialog). This hook used to
  // write a tool-shaped patch every 5s and would overwrite that record.
  void _docPath;
  void _patch;
  void _intervalMs;
}

export async function loadAutosave(docPath: string): Promise<unknown | null> {
  const result = await commands.autosaveGet(docPath);
  if (result.status === "error") return null;
  const json = result.data;
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export async function clearAutosave(docPath: string): Promise<void> {
  await commands.autosaveDelete(docPath);
}
