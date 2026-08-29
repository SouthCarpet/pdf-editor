// Plan 050 task D2-UX-2 (R2, fix wave F1): the window-close hook.
//
// No Rust change is needed here. Tauri 2 (`@tauri-apps/api` 2.11,
// `Window.onCloseRequested`) intercepts every native close as soon as a JS
// listener exists and, when the handler does not call `preventDefault()`,
// calls `destroy()` itself. `core:default` grants neither
// `core:window:allow-close` nor `core:window:allow-destroy`, so
// `src-tauri/capabilities/default.json` grants both explicitly: destroy for
// the unvetoed close, close for the re-issued close after Save or Discard.
// Without allow-destroy the window could only be killed from Task Manager
// (observed 2026-08-29 in the built app; unit tests mock the API and cannot
// see it).
//
// The working contract is therefore "veto, then re-ask":
//   - every close request asks `shouldIntercept()`. False (nothing unsaved)
//     means the handler does nothing and the OS close proceeds normally.
//     True means `preventDefault()` plus whatever the caller shows.
//   - once the user has decided, the caller clears the unsaved state and
//     calls `requestWindowClose()`. The handler runs again, now sees a
//     clean state, and lets the close through.
//
// Kept out of `src/tauri/bridge.ts` on purpose: that file, and its test
// fake `src/test/fakeTauriBridge.ts`, belong to another session's
// uncommitted work and this task must not touch them. This module follows
// the same "own the vendor import" shape bridge.ts documents, as its own
// separate seam.
import { getCurrentWindow } from "@tauri-apps/api/window";

export type UnlistenFn = () => void;

/**
 * Registers the app's window-close guard. `shouldIntercept` decides, per
 * close attempt, whether the close is vetoed. Returns the unlisten function.
 */
export async function onWindowCloseRequested(
  shouldIntercept: () => boolean,
): Promise<UnlistenFn> {
  return await getCurrentWindow().onCloseRequested((event) => {
    if (shouldIntercept()) event.preventDefault();
  });
}

/** Asks the window to close again after a decision was made. Goes through
 * the normal close path, so the guard above re-checks the state. */
export async function requestWindowClose(): Promise<void> {
  await getCurrentWindow().close();
}
