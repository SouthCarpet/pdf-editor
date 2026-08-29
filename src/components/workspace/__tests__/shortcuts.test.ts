// Plan 060 task T1 (R1/R2/R4): pure keyboard-shortcut resolution. No DOM,
// no React - `resolveShortcut` is a plain function so every combination is
// one assertion, and `useWorkspaceShortcuts` (the thin wiring layer that
// calls it from a real `keydown` listener) has nothing left to get wrong.
import { describe, it, expect } from "vitest";
import {
  isTextInputTarget,
  resolveShortcut,
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
});

describe("WORKSPACE_SHORTCUTS", () => {
  it("registers delete-pending on Delete and Backspace so the T3.3 overlay can list it", () => {
    const spec = WORKSPACE_SHORTCUTS.find((s) => s.action === "delete-pending");
    expect(spec).toBeDefined();
    expect(spec?.keys).toEqual(["Delete", "Backspace"]);
    expect(spec?.modifier).toBe("none");
    expect(spec?.allowInTextInput).toBe(false);
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
