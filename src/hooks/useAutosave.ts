// Phase 12 Task 69 - Autosave hook + helpers.
//
// Wired into the Edit panels (Forms / Annotations / Text). Each panel calls
// `useAutosave(docPath, currentState, 5000)` so unsaved edits persist to
// SQLite every 5 seconds.  On workspace mount, callers use `loadAutosave`
// to offer restoration; on successful save-to-disk or explicit discard
// they call `clearAutosave`.
import { useEffect, useRef } from "react";
import { commands } from "@/bindings";

export function useAutosave(
  docPath: string | null,
  patch: unknown,
  intervalMs = 5000,
) {
  // Keep the latest payload in a ref so the interval can read it without
  // re-arming when the patch object changes identity each render.
  const patchRef = useRef(patch);
  useEffect(() => {
    patchRef.current = patch;
  }, [patch]);

  useEffect(() => {
    if (!docPath) return;
    const id = setInterval(() => {
      void commands
        .autosavePut(docPath, JSON.stringify(patchRef.current))
        .catch(() => {});
    }, intervalMs);
    return () => clearInterval(id);
  }, [docPath, intervalMs]);
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
