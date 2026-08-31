// Plan 060 task T1 (R1/R2): pure keyboard-shortcut resolution, kept apart
// from the `window.addEventListener` wiring in `useWorkspaceShortcuts` so
// every combination can be tested as a plain function call - no DOM, no
// React, no jsdom event dispatch.
//
// Rule: shortcuts are ignored while a text input has focus (typing "+"
// into a field must not zoom the page; Delete/Backspace in a field must
// edit the text), except saves and the field-navigation keys registered
// for the pending-annotation strip.

export type ShortcutAction =
  | { type: "zoom-in" }
  | { type: "zoom-out" }
  | { type: "zoom-reset" }
  | { type: "toggle-book-mode" }
  | { type: "save" }
  | { type: "save-as" }
  | { type: "print" }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "delete-pending" }
  | { type: "next-field" }
  | { type: "previous-field" }
  | { type: "confirm-next-field" }
  | { type: "previous-page" }
  | { type: "next-page" }
  | { type: "previous-spread" }
  | { type: "next-spread" }
  | { type: "first-page" }
  | { type: "last-page" }
  | { type: "open-search" }
  | { type: "close-search" }
  | { type: "next-search-match" }
  | { type: "previous-search-match" }
  | { type: "open-shortcuts" };

export type ShortcutGroup = "navigation" | "forms" | "edit" | "view" | "file";

/** One row of the workspace shortcut table. T3.3's overlay iterates this
 * list, so a shortcut that is not here cannot appear there. */
export interface ShortcutBinding {
  /** Stable identity for rendering and tests. */
  id: string;
  action: ShortcutAction["type"];
  keys: readonly string[];
  /** Optional `KeyboardEvent.code` values (numpad Add/Subtract). */
  codes?: readonly string[];
  modifier: "ctrl" | "none";
  /** When set, Shift must match. When omitted, Shift is ignored (Ctrl+=
   * still zooms in on layouts where "+" needs Shift). */
  shift?: boolean;
  allowInTextInput: boolean;
  /** Enter-based search navigation is only active in the search query. */
  searchInputOnly?: boolean;
  /** Catalog key the T3.3 overlay will pass to `t()`. */
  labelKey: string;
  group: ShortcutGroup;
}

export const WORKSPACE_SHORTCUTS: readonly ShortcutBinding[] = [
  {
    id: "open-search",
    action: "open-search",
    keys: ["f"],
    modifier: "ctrl",
    shift: false,
    allowInTextInput: true,
    labelKey: "shortcuts.open_search",
    group: "navigation",
  },
  {
    id: "print",
    action: "print",
    keys: ["p"],
    modifier: "ctrl",
    shift: false,
    allowInTextInput: true,
    labelKey: "print.action",
    group: "file",
  },
  {
    id: "save-as",
    action: "save-as",
    keys: ["s"],
    modifier: "ctrl",
    shift: true,
    allowInTextInput: true,
    labelKey: "common:save_as",
    group: "file",
  },
  {
    id: "save",
    action: "save",
    keys: ["s"],
    modifier: "ctrl",
    shift: false,
    allowInTextInput: true,
    labelKey: "common:save",
    group: "file",
  },
  {
    id: "redo-ctrl-shift-z",
    action: "redo",
    keys: ["z"],
    modifier: "ctrl",
    shift: true,
    allowInTextInput: false,
    labelKey: "history.redo",
    group: "edit",
  },
  {
    id: "redo-ctrl-y",
    action: "redo",
    keys: ["y"],
    modifier: "ctrl",
    shift: false,
    allowInTextInput: false,
    labelKey: "history.redo",
    group: "edit",
  },
  {
    id: "undo",
    action: "undo",
    keys: ["z"],
    modifier: "ctrl",
    shift: false,
    allowInTextInput: false,
    labelKey: "history.undo",
    group: "edit",
  },
  {
    id: "zoom-reset",
    action: "zoom-reset",
    keys: ["0"],
    modifier: "ctrl",
    allowInTextInput: false,
    labelKey: "toolbar.zoom_reset",
    group: "view",
  },
  {
    id: "toggle-book-mode",
    action: "toggle-book-mode",
    keys: ["2"],
    modifier: "ctrl",
    shift: false,
    allowInTextInput: false,
    labelKey: "toolbar.book_mode",
    group: "view",
  },
  {
    id: "zoom-in",
    action: "zoom-in",
    keys: ["+", "="],
    codes: ["NumpadAdd"],
    modifier: "ctrl",
    allowInTextInput: false,
    labelKey: "zoom_in",
    group: "view",
  },
  {
    id: "zoom-out",
    action: "zoom-out",
    keys: ["-"],
    codes: ["NumpadSubtract"],
    modifier: "ctrl",
    allowInTextInput: false,
    labelKey: "zoom_out",
    group: "view",
  },
  {
    id: "open-shortcuts",
    action: "open-shortcuts",
    keys: ["?"],
    modifier: "none",
    shift: true,
    allowInTextInput: false,
    labelKey: "shortcuts.open_shortcuts",
    group: "view",
  },
  {
    id: "delete-pending",
    action: "delete-pending",
    keys: ["Delete", "Backspace"],
    modifier: "none",
    allowInTextInput: false,
    labelKey: "pending_annotation.delete",
    group: "edit",
  },
  {
    id: "previous-spread",
    action: "previous-spread",
    keys: ["PageUp"],
    modifier: "ctrl",
    shift: false,
    allowInTextInput: false,
    labelKey: "shortcuts.previous_spread",
    group: "navigation",
  },
  {
    id: "next-spread",
    action: "next-spread",
    keys: ["PageDown"],
    modifier: "ctrl",
    shift: false,
    allowInTextInput: false,
    labelKey: "shortcuts.next_spread",
    group: "navigation",
  },
  {
    id: "previous-page",
    action: "previous-page",
    keys: ["PageUp"],
    modifier: "none",
    allowInTextInput: false,
    labelKey: "shortcuts.previous_page",
    group: "navigation",
  },
  {
    id: "next-page",
    action: "next-page",
    keys: ["PageDown"],
    modifier: "none",
    allowInTextInput: false,
    labelKey: "shortcuts.next_page",
    group: "navigation",
  },
  {
    id: "first-page",
    action: "first-page",
    keys: ["Home"],
    modifier: "none",
    allowInTextInput: false,
    labelKey: "shortcuts.first_page",
    group: "navigation",
  },
  {
    id: "last-page",
    action: "last-page",
    keys: ["End"],
    modifier: "none",
    allowInTextInput: false,
    labelKey: "shortcuts.last_page",
    group: "navigation",
  },
  {
    id: "close-search",
    action: "close-search",
    keys: ["Escape"],
    modifier: "none",
    allowInTextInput: true,
    labelKey: "shortcuts.close_search",
    group: "navigation",
  },
  {
    id: "previous-search-match-f3",
    action: "previous-search-match",
    keys: ["F3"],
    modifier: "none",
    shift: true,
    allowInTextInput: true,
    labelKey: "shortcuts.previous_search_match",
    group: "navigation",
  },
  {
    id: "next-search-match-f3",
    action: "next-search-match",
    keys: ["F3"],
    modifier: "none",
    shift: false,
    allowInTextInput: true,
    labelKey: "shortcuts.next_search_match",
    group: "navigation",
  },
  {
    id: "previous-search-match-enter",
    action: "previous-search-match",
    keys: ["Enter"],
    modifier: "none",
    shift: true,
    allowInTextInput: true,
    searchInputOnly: true,
    labelKey: "shortcuts.previous_search_match",
    group: "navigation",
  },
  {
    id: "next-search-match-enter",
    action: "next-search-match",
    keys: ["Enter"],
    modifier: "none",
    shift: false,
    allowInTextInput: true,
    searchInputOnly: true,
    labelKey: "shortcuts.next_search_match",
    group: "navigation",
  },
  {
    id: "previous-field",
    action: "previous-field",
    keys: ["Tab"],
    modifier: "none",
    shift: true,
    allowInTextInput: true,
    labelKey: "shortcuts.previous_field",
    group: "forms",
  },
  {
    id: "next-field",
    action: "next-field",
    keys: ["Tab"],
    modifier: "none",
    shift: false,
    allowInTextInput: true,
    labelKey: "shortcuts.next_field",
    group: "forms",
  },
  {
    id: "confirm-next-field",
    action: "confirm-next-field",
    keys: ["Enter"],
    modifier: "none",
    shift: false,
    allowInTextInput: true,
    labelKey: "shortcuts.confirm_next_field",
    group: "forms",
  },
];

export interface ShortcutFocus {
  isTextInput: boolean;
  isFormControl: boolean;
  isStripTextInput: boolean;
  isSearchInput: boolean;
}

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
 * event is not one of ours. The focus context permits field navigation in
 * the strip text input, but not in another form control. Bindings come
 * from `WORKSPACE_SHORTCUTS` so the T3.3 overlay cannot drift. */
export function resolveShortcut(
  e: ShortcutKeyEvent,
  focus: ShortcutFocus | boolean,
): ShortcutAction | null {
  const context: ShortcutFocus =
    typeof focus === "boolean"
      ? { isTextInput: focus, isFormControl: focus, isStripTextInput: false, isSearchInput: false }
      : focus;
  for (const spec of WORKSPACE_SHORTCUTS) {
    if (!bindingMatches(spec, e)) continue;
    if (spec.searchInputOnly && !context.isSearchInput) continue;
    if (context.isTextInput && !spec.allowInTextInput) return null;
    if (
      (spec.action === "next-field" || spec.action === "previous-field") &&
      context.isFormControl &&
      !context.isStripTextInput
    ) {
      return null;
    }
    if (spec.action === "confirm-next-field" && !context.isStripTextInput) return null;
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

export function shortcutFocus(target: EventTarget | null): ShortcutFocus {
  if (!(target instanceof HTMLElement)) {
    return {
      isTextInput: false,
      isFormControl: false,
      isStripTextInput: false,
      isSearchInput: false,
    };
  }
  const isStripTextInput =
    target instanceof HTMLInputElement &&
    target.type === "text" &&
    target.closest('[data-pending-annotation-host] [role="group"]') !== null;
  return {
    isTextInput: isTextInputTarget(target),
    isFormControl:
      target.matches("input, textarea, select, button") || target.isContentEditable === true,
    isStripTextInput,
    isSearchInput: target.hasAttribute("data-workspace-search-input"),
  };
}
