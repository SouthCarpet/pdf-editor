// Plan 060 task T1 (R1/R2/R4): pure keyboard-shortcut resolution. No DOM,
// no React - `resolveShortcut` is a plain function so every combination is
// one assertion, and `useWorkspaceShortcuts` (the thin wiring layer that
// calls it from a real `keydown` listener) has nothing left to get wrong.
import { describe, it, expect } from "vitest";
import {
  isTextInputTarget,
  resolveShortcut,
  shortcutFocus,
  WORKSPACE_SHORTCUTS,
  type ShortcutKeyEvent,
} from "../shortcuts";

function key(overrides: Partial<ShortcutKeyEvent> & { key: string }): ShortcutKeyEvent {
  return { ctrlKey: false, metaKey: false, shiftKey: false, ...overrides };
}

describe("resolveShortcut", () => {
  it("Ctrl+Plus zooms in", () => {
    expect(resolveShortcut(key({ key: "+", ctrlKey: true }), false)).toEqual({ type: "zoom-in" });
  });

  it("Ctrl+= zooms in (keyboards where + needs Shift)", () => {
    expect(resolveShortcut(key({ key: "=", ctrlKey: true }), false)).toEqual({ type: "zoom-in" });
  });

  it("a numpad Add key zooms in via `code`", () => {
    expect(
      resolveShortcut(key({ key: "+", code: "NumpadAdd", ctrlKey: true }), false),
    ).toEqual({ type: "zoom-in" });
  });

  it("Ctrl+Minus zooms out", () => {
    expect(resolveShortcut(key({ key: "-", ctrlKey: true }), false)).toEqual({ type: "zoom-out" });
  });

  it("Ctrl+0 resets zoom", () => {
    expect(resolveShortcut(key({ key: "0", ctrlKey: true }), false)).toEqual({
      type: "zoom-reset",
    });
  });

  it("Ctrl+2 toggles book mode only outside text input", () => {
    expect(resolveShortcut(key({ key: "2", ctrlKey: true }), false)).toEqual({
      type: "toggle-book-mode",
    });
    expect(resolveShortcut(key({ key: "2", ctrlKey: true }), true)).toBeNull();
  });

  it("Cmd+Plus (metaKey) zooms in the same as Ctrl+Plus", () => {
    expect(resolveShortcut(key({ key: "+", metaKey: true }), false)).toEqual({ type: "zoom-in" });
  });

  it("without a modifier key, nothing fires", () => {
    expect(resolveShortcut(key({ key: "+" }), false)).toBeNull();
  });

  it("an unrelated Ctrl+key combination resolves to nothing", () => {
    expect(resolveShortcut(key({ key: "b", ctrlKey: true }), false)).toBeNull();
  });

  it("zoom shortcuts are ignored while a text input has focus", () => {
    expect(resolveShortcut(key({ key: "+", ctrlKey: true }), true)).toBeNull();
    expect(resolveShortcut(key({ key: "-", ctrlKey: true }), true)).toBeNull();
    expect(resolveShortcut(key({ key: "0", ctrlKey: true }), true)).toBeNull();
  });

  it("Ctrl+S calls save, even while a text input has focus", () => {
    expect(resolveShortcut(key({ key: "s", ctrlKey: true }), false)).toEqual({ type: "save" });
    expect(resolveShortcut(key({ key: "s", ctrlKey: true }), true)).toEqual({ type: "save" });
  });

  it("Ctrl+Shift+S calls save-as, even while a text input has focus", () => {
    expect(resolveShortcut(key({ key: "s", ctrlKey: true, shiftKey: true }), false)).toEqual({
      type: "save-as",
    });
    expect(resolveShortcut(key({ key: "s", ctrlKey: true, shiftKey: true }), true)).toEqual({
      type: "save-as",
    });
  });

  it("Ctrl+S is case-insensitive (Caps Lock produces an uppercase key)", () => {
    expect(resolveShortcut(key({ key: "S", ctrlKey: true }), false)).toEqual({ type: "save" });
  });

  it("Ctrl+P opens print even while a text input has focus", () => {
    expect(resolveShortcut(key({ key: "p", ctrlKey: true }), false)).toEqual({ type: "print" });
    expect(resolveShortcut(key({ key: "p", ctrlKey: true }), true)).toEqual({ type: "print" });
  });

  it("Ctrl+Z resolves undo and both redo variants resolve redo", () => {
    expect(resolveShortcut(key({ key: "z", ctrlKey: true }), false)).toEqual({ type: "undo" });
    expect(resolveShortcut(key({ key: "y", ctrlKey: true }), false)).toEqual({ type: "redo" });
    expect(resolveShortcut(key({ key: "z", ctrlKey: true, shiftKey: true }), false)).toEqual({
      type: "redo",
    });
  });

  it("leaves undo and redo to the browser while any text input has focus", () => {
    expect(resolveShortcut(key({ key: "z", ctrlKey: true }), true)).toBeNull();
    expect(resolveShortcut(key({ key: "y", ctrlKey: true }), true)).toBeNull();
    expect(resolveShortcut(key({ key: "z", ctrlKey: true, shiftKey: true }), true)).toBeNull();
  });

  // Plan 062 T1.1: Delete / Backspace clear a selected pending fill, but
  // only when the event is not typing into a text field. Oracle: Michal's
  // 2026-08-29 defect (click a filled cell, Delete does nothing) and R1
  // of the round-2 brief.
  it("Delete maps to delete-pending when no text input is focused", () => {
    expect(resolveShortcut(key({ key: "Delete" }), false)).toEqual({ type: "delete-pending" });
  });

  it("Backspace maps to delete-pending when no text input is focused", () => {
    expect(resolveShortcut(key({ key: "Backspace" }), false)).toEqual({
      type: "delete-pending",
    });
  });

  it("Delete and Backspace do not map to delete-pending while a text input is focused", () => {
    expect(resolveShortcut(key({ key: "Delete" }), true)).toBeNull();
    expect(resolveShortcut(key({ key: "Backspace" }), true)).toBeNull();
  });

  it("Ctrl+Delete and Ctrl+Backspace are not the delete-pending shortcut", () => {
    expect(resolveShortcut(key({ key: "Delete", ctrlKey: true }), false)).toBeNull();
    expect(resolveShortcut(key({ key: "Backspace", ctrlKey: true }), false)).toBeNull();
  });

  it("Tab and Shift+Tab navigate when the strip text input is focused", () => {
    const stripFocus = {
      isTextInput: true,
      isFormControl: true,
      isStripTextInput: true,
      isSearchInput: false,
    };
    expect(resolveShortcut(key({ key: "Tab" }), stripFocus)).toEqual({ type: "next-field" });
    expect(resolveShortcut(key({ key: "Tab", shiftKey: true }), stripFocus)).toEqual({
      type: "previous-field",
    });
  });

  it("Enter confirms and navigates only from the strip text input", () => {
    const stripFocus = {
      isTextInput: true,
      isFormControl: true,
      isStripTextInput: true,
      isSearchInput: false,
    };
    expect(resolveShortcut(key({ key: "Enter" }), stripFocus)).toEqual({
      type: "confirm-next-field",
    });
    expect(resolveShortcut(key({ key: "Enter" }), false)).toBeNull();
  });

  it("Tab does not navigate from another form control such as the colour input", () => {
    const colorFocus = {
      isTextInput: true,
      isFormControl: true,
      isStripTextInput: false,
      isSearchInput: false,
    };
    expect(resolveShortcut(key({ key: "Tab" }), colorFocus)).toBeNull();
  });

  // Oracle: T3.1 R2 requires page keys on the page and forbids them in
  // the pending-annotation strip input.
  it("PageUp navigates on the page but not from the strip text input", () => {
    const stripFocus = {
      isTextInput: true,
      isFormControl: true,
      isStripTextInput: true,
      isSearchInput: false,
    };
    expect(resolveShortcut(key({ key: "PageUp" }), false)).toEqual({ type: "previous-page" });
    expect(resolveShortcut(key({ key: "PageUp" }), stripFocus)).toBeNull();
  });

  it("PageDown, Home and End map to next, first and last page", () => {
    expect(resolveShortcut(key({ key: "PageDown" }), false)).toEqual({ type: "next-page" });
    expect(resolveShortcut(key({ key: "Home" }), false)).toEqual({ type: "first-page" });
    expect(resolveShortcut(key({ key: "End" }), false)).toEqual({ type: "last-page" });
  });

  it("Ctrl+PageUp and Ctrl+PageDown move by spread", () => {
    expect(resolveShortcut(key({ key: "PageUp", ctrlKey: true }), false)).toEqual({
      type: "previous-spread",
    });
    expect(resolveShortcut(key({ key: "PageDown", ctrlKey: true }), false)).toEqual({
      type: "next-spread",
    });
  });

  // Oracle: T3.1 R2 explicitly allows Ctrl+F from the strip input.
  it("Ctrl+F opens search from the strip text input", () => {
    const stripFocus = {
      isTextInput: true,
      isFormControl: true,
      isStripTextInput: true,
      isSearchInput: false,
    };
    expect(resolveShortcut(key({ key: "f", ctrlKey: true }), stripFocus)).toEqual({
      type: "open-search",
    });
  });

  it("Enter and Shift+Enter navigate matches only in the search input", () => {
    const searchFocus = {
      isTextInput: true,
      isFormControl: true,
      isStripTextInput: false,
      isSearchInput: true,
    };
    expect(resolveShortcut(key({ key: "Enter" }), searchFocus)).toEqual({
      type: "next-search-match",
    });
    expect(resolveShortcut(key({ key: "Enter", shiftKey: true }), searchFocus)).toEqual({
      type: "previous-search-match",
    });
  });

  it("Shift+/ resolves the registered question-mark shortcut only outside text input", () => {
    expect(resolveShortcut(key({ key: "?", shiftKey: true }), false)).toEqual({
      type: "open-shortcuts",
    });
    expect(resolveShortcut(key({ key: "?", shiftKey: true }), true)).toBeNull();
  });
});

describe("WORKSPACE_SHORTCUTS", () => {
  it("registers Ctrl+P in the file group and allows it in text input", () => {
    const row = WORKSPACE_SHORTCUTS.find((shortcut) => shortcut.id === "print");
    expect(row).toMatchObject({
      action: "print",
      keys: ["p"],
      modifier: "ctrl",
      shift: false,
      allowInTextInput: true,
      group: "file",
    });
  });

  it("registers the shortcut overlay in the view group", () => {
    const row = WORKSPACE_SHORTCUTS.find((shortcut) => shortcut.id === "open-shortcuts");
    expect(row).toMatchObject({
      action: "open-shortcuts",
      keys: ["?"],
      shift: true,
      allowInTextInput: false,
      group: "view",
    });
  });

  it("registers Ctrl+2 for book mode outside text inputs", () => {
    const row = WORKSPACE_SHORTCUTS.find((shortcut) => shortcut.id === "toggle-book-mode");
    expect(row).toMatchObject({
      action: "toggle-book-mode",
      keys: ["2"],
      modifier: "ctrl",
      shift: false,
      allowInTextInput: false,
      group: "view",
    });
  });

  it("registers both Ctrl+Page spread navigation rows", () => {
    const rows = WORKSPACE_SHORTCUTS.filter((shortcut) => shortcut.action.endsWith("spread"));
    expect(rows.map(({ action, keys, modifier }) => ({ action, keys, modifier }))).toEqual([
      { action: "previous-spread", keys: ["PageUp"], modifier: "ctrl" },
      { action: "next-spread", keys: ["PageDown"], modifier: "ctrl" },
    ]);
    expect(rows.every(({ allowInTextInput }) => !allowInTextInput)).toBe(true);
  });
  it("registers delete-pending on Delete and Backspace so the T3.3 overlay can list it", () => {
    const spec = WORKSPACE_SHORTCUTS.find((s) => s.action === "delete-pending");
    expect(spec).toBeDefined();
    expect(spec?.keys).toEqual(["Delete", "Backspace"]);
    expect(spec?.modifier).toBe("none");
    expect(spec?.allowInTextInput).toBe(false);
  });

  it("registers all three field-navigation rows for the shortcut overlay", () => {
    const rows = WORKSPACE_SHORTCUTS.filter((spec) => spec.action.includes("field"));
    expect(rows.map(({ action }) => action)).toEqual([
      "previous-field",
      "next-field",
      "confirm-next-field",
    ]);
    expect(rows.every(({ allowInTextInput }) => allowInTextInput)).toBe(true);
  });

  it("registers undo and both redo rows outside text inputs", () => {
    const rows = WORKSPACE_SHORTCUTS.filter(
      (spec) => spec.action === "undo" || spec.action === "redo",
    );
    expect(rows.map(({ action, keys, shift }) => ({ action, keys, shift }))).toEqual([
      { action: "redo", keys: ["z"], shift: true },
      { action: "redo", keys: ["y"], shift: false },
      { action: "undo", keys: ["z"], shift: false },
    ]);
    expect(rows.every(({ allowInTextInput }) => !allowInTextInput)).toBe(true);
  });

  it("registers all page navigation rows outside text inputs", () => {
    const actions = ["previous-page", "next-page", "first-page", "last-page"];
    const rows = WORKSPACE_SHORTCUTS.filter((spec) => actions.includes(spec.action));
    expect(rows.map(({ action, keys }) => ({ action, keys }))).toEqual([
      { action: "previous-page", keys: ["PageUp"] },
      { action: "next-page", keys: ["PageDown"] },
      { action: "first-page", keys: ["Home"] },
      { action: "last-page", keys: ["End"] },
    ]);
    expect(rows.every(({ allowInTextInput }) => !allowInTextInput)).toBe(true);
  });
});

describe("isTextInputTarget", () => {
  it("is false for null", () => {
    expect(isTextInputTarget(null)).toBe(false);
  });

  it("is true for an <input>", () => {
    expect(isTextInputTarget(document.createElement("input"))).toBe(true);
  });

  it("is true for a <textarea>", () => {
    expect(isTextInputTarget(document.createElement("textarea"))).toBe(true);
  });

  it("is true for a contentEditable element", () => {
    const div = document.createElement("div");
    Object.defineProperty(div, "isContentEditable", { value: true });
    expect(isTextInputTarget(div)).toBe(true);
  });

  it("is false for a plain button", () => {
    expect(isTextInputTarget(document.createElement("button"))).toBe(false);
  });
});

describe("shortcutFocus", () => {
  it("recognises only the text input inside the pending annotation strip", () => {
    const host = document.createElement("div");
    host.dataset.pendingAnnotationHost = "";
    const group = document.createElement("div");
    group.setAttribute("role", "group");
    const stripText = document.createElement("input");
    stripText.type = "text";
    const color = document.createElement("input");
    color.type = "color";
    group.append(stripText, color);
    host.append(group);
    document.body.append(host);

    expect(shortcutFocus(stripText).isStripTextInput).toBe(true);
    expect(shortcutFocus(color).isStripTextInput).toBe(false);
    host.remove();
  });

  it("recognises the workspace search input", () => {
    const input = document.createElement("input");
    input.setAttribute("data-workspace-search-input", "");
    expect(shortcutFocus(input).isSearchInput).toBe(true);
  });
});
