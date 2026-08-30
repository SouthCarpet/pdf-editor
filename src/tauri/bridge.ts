// The one module in `src/` that talks to Tauri's runtime APIs: file dialogs,
// command invocation, event subscription and native file drops.
//
// Why it exists: tests used to `vi.mock("@tauri-apps/plugin-dialog")` and
// friends, which means hand-writing the shape of a vendor API we do not own.
// When Tauri changes that shape the mocks keep passing and the real app breaks.
// Call sites import from here instead, so a test fakes one module we own.
//
// Two deliberate exemptions:
//   - `src/bindings.ts` is written by tauri-specta and CI gates on it being
//     unchanged, so it keeps its own `invoke` import.
//   - Call sites not covered by a test still import the vendor packages
//     directly. Move them here as you touch them; there is no value in
//     rewriting untested call sites in the same change.
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open, save } from "@tauri-apps/plugin-dialog";
import { exists, stat } from "@tauri-apps/plugin-fs";
import { revealItemInDir } from "@tauri-apps/plugin-opener";

export type { UnlistenFn };

export interface FileFilter {
  name: string;
  extensions: string[];
}

export interface PickPathsOptions {
  multiple?: boolean;
  directory?: boolean;
  filters?: FileFilter[];
}

export interface PickSavePathOptions {
  defaultPath?: string;
  filters?: FileFilter[];
}

/**
 * Native open dialog. Returns the picked paths, and an empty array when the
 * user cancels.
 *
 * The vendor `open` returns `string | string[] | null` depending on the
 * `multiple` flag, so every call site repeated the same null check and array
 * wrap. Returning one type removes that chance to get it wrong.
 */
export async function pickPaths(options: PickPathsOptions): Promise<string[]> {
  const selected = await open(options);
  if (selected === null) return [];
  return Array.isArray(selected) ? selected : [selected];
}

/** Native save dialog. Returns the picked path, or `null` when cancelled. */
export async function pickSavePath(
  options: PickSavePathOptions,
): Promise<string | null> {
  return await save(options);
}

/** Whether a path exists on disk. Used at start for "open last document". */
export async function pathExists(path: string): Promise<boolean> {
  return await exists(path);
}

/** File mtime in epoch milliseconds, or null when `stat` fails or the
 * platform leaves mtime empty. Recovery treats null as "mtime unavailable"
 * and offers any autosave record. */
export async function fileMtimeMs(path: string): Promise<number | null> {
  try {
    const info = await stat(path);
    if (info.mtime === null) return null;
    return info.mtime.getTime();
  } catch {
    return null;
  }
}

/** Reveals a saved file in the platform file explorer. */
export async function revealSavedFile(path: string): Promise<void> {
  await revealItemInDir(path);
}

/** Calls a Tauri command that has no generated binding. */
export async function invokeCommand<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  return await invoke<T>(command, args);
}

/**
 * Subscribes to a Tauri event. The handler receives the payload directly;
 * no call site cared about the envelope around it.
 */
export async function listenEvent<T>(
  event: string,
  handler: (payload: T) => void,
): Promise<UnlistenFn> {
  return await listen<T>(event, (e) => handler(e.payload));
}

/** Existing PDF arguments passed to the first application process. */
export async function startupPaths(): Promise<string[]> {
  return await invoke<string[]>("startup_paths");
}

/** PDF arguments forwarded when Explorer launches a second app process. */
export async function onOpenPaths(
  handler: (paths: string[]) => void,
): Promise<UnlistenFn> {
  return await listenEvent<string[]>("open-paths", handler);
}

/** A native OS drag-and-drop over the app window. */
export type FileDropEvent =
  | { kind: "over" }
  | { kind: "leave" }
  | { kind: "drop"; paths: string[] };

/**
 * Subscribes to native OS file drops on the app window. Rejects when there is
 * no Tauri event channel, which is what a browser-only `vite preview` run
 * looks like.
 */
export async function onFileDrop(
  handler: (event: FileDropEvent) => void,
): Promise<UnlistenFn> {
  return await getCurrentWebview().onDragDropEvent((event) => {
    const payload = event.payload;
    if (payload.type === "enter" || payload.type === "over") {
      handler({ kind: "over" });
    } else if (payload.type === "leave") {
      handler({ kind: "leave" });
    } else {
      handler({ kind: "drop", paths: payload.paths });
    }
  });
}
