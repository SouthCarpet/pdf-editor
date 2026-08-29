// Plan 060 task T1 (R1/R2): pure keyboard-shortcut resolution, kept apart
// from the `window.addEventListener` wiring in `useWorkspaceShortcuts` so
// every combination can be tested as a plain function call - no DOM, no
// React, no jsdom event dispatch.
//
// Rule: shortcuts are ignored while a text input has focus (typing "+"
// into a field must not zoom the page; Delete/Backspace in a field must
// edit the text), except Ctrl+S / Ctrl+Shift+S, which always save.

export type ShortcutAction =
  | { type: "zoom-in" }
  | { type: "zoom-out" }
  | { type: "zoom-reset" }
  | { type: "save" }
  | { type: "save-as" }
  | { type: "delete-pending" };

/** One row of the workspace shortcut table. T3.3's overlay iterates this
 * list, so a shortcut that is not here cannot appear there. */
export interface ShortcutBinding {
  action: ShortcutAction["type"];
  keys: readonly string[];
  /** Optional `KeyboardEvent.code` values (numpad Add/Subtract). */
  codes?: readonly string[];
  modifier: "ctrl" | "none";
  /** When set, Shift must match. When omitted, Shift is ignored (Ctrl+=
   * still zooms in on layouts where "+" needs Shift). */
  shift?: boolean;
  allowInTextInput: boolean;
  /** Catalog key the T3.3 overlay will pass to `t()`. */
  labelKey: string;
}

export const WORKSPACE_SHORTCUTS: readonly ShortcutBinding[] = [
  {
    action: "save-as",
    keys: ["s"],
    modifier: "ctrl",
    shift: true,
    allowInTextInput: true,
    labelKey: "save_as",
  },
  {
    action: "save",
    keys: ["s"],
    modifier: "ctrl",
    shift: false,
    allowInTextInput: true,
    labelKey: "save",
  },
  {
    action: "zoom-reset",
    keys: ["0"],
    modifier: "ctrl",
    allowInTextInput: false,
    labelKey: "toolbar.zoom_reset",
  },
  {
    action: "zoom-in",
    keys: ["+", "="],
    codes: ["NumpadAdd"],
    modifier: "ctrl",
    allowInTextInput: false,
    labelKey: "zoom_in",
  },
  {
    action: "zoom-out",
    keys: ["-"],
    codes: ["NumpadSubtract"],
    modifier: "ctrl",
    allowInTextInput: false,
    labelKey: "zoom_out",
  },
  {
    action: "delete-pending",
    keys: ["Delete", "Backspace"],
    modifier: "none",
    allowInTextInput: false,
    labelKey: "pending_annotation.delete",
  },
];

/** The subset of `KeyboardEvent` the resolver reads. Kept narrow so tests
 * can pass a plain object instead of constructing a real `KeyboardEvent`. */
export interface ShortcutKeyEvent {
  key: string;
  code?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

function bindingMatches(spec: ShortcutBinding, e: ShortcutKeyEvent): boolean {
  const withModifier = e.ctrlKey || e.metaKey;
  if (spec.modifier === "ctrl" && !withModifier) return false;
  if (spec.modifier === "none" && withModifier) return false;
  if (spec.shift === true && !e.shiftKey) return false;
  if (spec.shift === false && e.shiftKey) return false;
  const keyHit = spec.keys.some((k) =>
    k.length === 1 ? e.key.toLowerCase() === k.toLowerCase() : e.key === k,
  );
  const codeHit = spec.codes !== undefined && e.code !== undefined && spec.codes.includes(e.code);
  return keyHit || codeHit;
}

/** Resolves one keydown into a workspace shortcut action, or `null` if the
 * event is not one of ours. `isTextInputFocused` gates every action except
 * those marked `allowInTextInput` (save / save-as). Bindings come from
 * `WORKSPACE_SHORTCUTS` so the T3.3 overlay cannot drift. */
export function resolveShortcut(
  e: ShortcutKeyEvent,
  isTextInputFocused: boolean,
): ShortcutAction | null {
  for (const spec of WORKSPACE_SHORTCUTS) {
    if (!bindingMatches(spec, e)) continue;
    if (isTextInputFocused && !spec.allowInTextInput) return null;
    return { type: spec.action };
  }
  return null;
}

/** True when `target` is where typing "+"/"-"/"0"/"s" means literal text,
 * not a shortcut: a text field, a textarea, or a contenteditable region. */
export function isTextInputTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable === true;
}
