// The family grouping of the font list: one row per family (the regular
// upright face wins), Standard 14 and Recent in their own groups, the
// search text filters all three. Pins the behaviour of `groupFonts` after
// the complexity refactor (plan 119 K2).
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SystemFont } from "@/bindings";

const { listFontsCmd } = vi.hoisted(() => ({ listFontsCmd: vi.fn() }));
vi.mock("@/bindings", () => ({ commands: { listFontsCmd } }));

import { FontPicker, type FontPickerValue } from "../font-picker";

function font(family: string, over: Partial<SystemFont> = {}): SystemFont {
  return {
    family,
    postscript_name: `${family}-Regular`,
    style: "Regular",
    weight: 400,
    italic: false,
    monospace: false,
    file_path: `C:/fonts/${family}.ttf`,
    is_standard_14: false,
    ...over,
  };
}

const VALUE: FontPickerValue = {
  font_family: "Arial",
  font_postscript_name: "Arial-Regular",
  size_pt: 12,
  bold: false,
  italic: false,
  underline: false,
  strikethrough: false,
  align: "left",
};

const FONTS: SystemFont[] = [
  font("Helvetica", { is_standard_14: true, postscript_name: "Helvetica" }),
  // Bold face listed first: the regular face must still win the row.
  font("Zeta", { weight: 700, postscript_name: "Zeta-Bold" }),
  font("Zeta", { postscript_name: "Zeta-Regular" }),
  font("Alpha", { italic: true, postscript_name: "Alpha-Italic" }),
  font("Mid"),
];

async function openList() {
  render(<FontPicker value={VALUE} onChange={() => {}} />);
  await userEvent.click(await screen.findByRole("button", { name: /Arial/ }));
  return screen.findByPlaceholderText("Search fonts…");
}

function rowNames() {
  return screen
    .getAllByRole("button")
    .filter((b) => b.hasAttribute("title"))
    .map((b) => `${b.textContent}:${b.getAttribute("title")}`);
}

beforeEach(() => {
  // Radix (popover, slider) measures with ResizeObserver; jsdom has none.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  localStorage.clear();
  listFontsCmd.mockReset().mockResolvedValue({ status: "ok", data: FONTS });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("FontPicker font groups", () => {
  it("lists Standard 14 first, then one row per family sorted by name, regular face preferred", async () => {
    await openList();
    expect(rowNames()).toEqual([
      "Helvetica:Helvetica",
      "Alpha:Alpha-Italic",
      "Mid:Mid-Regular",
      "Zeta:Zeta-Regular",
    ]);
  });

  it("moves a recent family out of the system list into Recent", async () => {
    localStorage.setItem("pdf-editor.recentFonts", JSON.stringify(["Mid"]));
    await openList();
    const recent = screen.getByText("Recent").parentElement!;
    expect(within(recent).getByRole("button", { name: "Mid" })).toBeInTheDocument();
    expect(rowNames().filter((r) => r.startsWith("Mid:"))).toHaveLength(1);
  });

  it("filters every group by the search text", async () => {
    const search = await openList();
    await userEvent.type(search, "zet");
    expect(rowNames()).toEqual(["Zeta:Zeta-Regular"]);
  });
});
