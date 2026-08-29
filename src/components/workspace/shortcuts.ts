// Plan 060 task T1 (R1/R2): pure keyboard-shortcut resolution, kept apart
// from the `window.addEventListener` wiring in `useWorkspaceShortcuts` so
// every combination can be tested as a plain function call - no DOM, no
// React, no jsdom event dispatch.
//
// Rule: shortcuts are ignored while a text input has focus (typing "+"
// into a field must not zoom the page), except Ctrl+S / Ctrl+Shift+S,
// which always save - a user mid-edit still expects Ctrl+S to work.

export type ShortcutAction =
  | { type: "zoom-in" }
  | { type: "zoom-out" }
  | { type: "zoom-reset" }
  | { type: "save" }
  | { type: "save-as" };

/** The subset of `KeyboardEvent` the resolver reads. Kept narrow so tests
 * can pass a plain object instead of constructing a real `KeyboardEvent`. */
export interface ShortcutKeyEvent {
  key: string;
  code?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

// "+" covers Shift+= on a US layout; "=" covers the unshifted key some
// layouts use for "+" directly (brief: "Ctrl+= for keyboards where plus
// needs Shift"). Numpad Add/Subtract report `code`, not a distinct `key`,
// on some platforms, so both are checked.
const ZOOM_IN_KEYS = new Set(["+", "="]);
const ZOOM_OUT_KEYS = new Set(["-"]);

function isZoomInKey(e: ShortcutKeyEvent): boolean {
  return ZOOM_IN_KEYS.has(e.key) || e.code === "NumpadAdd";
}

function isZoomOutKey(e: ShortcutKeyEvent): boolean {
  return ZOOM_OUT_KEYS.has(e.key) || e.code === "NumpadSubtract";
}

/** Resolves one keydown into a workspace shortcut action, or `null` if the
 * event is not one of ours. `isTextInputFocused` gates every action except
 * save / save-as. */
export function resolveShortcut(
  e: ShortcutKeyEvent,
  isTextInputFocused: boolean,
): ShortcutAction | null {
  const withModifier = e.ctrlKey || e.metaKey;
  if (!withModifier) return null;

  if (e.key.toLowerCase() === "s") {
    return e.shiftKey ? { type: "save-as" } : { type: "save" };
  }
  if (isTextInputFocused) return null;
  if (e.key === "0") return { type: "zoom-reset" };
  if (isZoomInKey(e)) return { type: "zoom-in" };
  if (isZoomOutKey(e)) return { type: "zoom-out" };
  return null;
}

/** True when `target` is where typing "+"/"-"/"0"/"s" means literal text,
 * not a shortcut: a text field, a textarea, or a contenteditable region. */
export function isTextInputTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable === true;
}
