import { useState } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "@/i18n";
import {
  formatKeys,
  SHORTCUT_GROUP_ORDER,
  shortcutTranslationKey,
} from "../shortcutDisplay";
import { ShortcutOverlay } from "../ShortcutOverlay";
import { WORKSPACE_SHORTCUTS } from "../shortcuts";

function shortcut(id: string) {
  const row = WORKSPACE_SHORTCUTS.find((candidate) => candidate.id === id);
  if (row === undefined) throw new Error(`Missing shortcut test fixture: ${id}`);
  return row;
}

function OverlayHarness() {
  const [open, setOpen] = useState(true);
  return <ShortcutOverlay open={open} onOpenChange={setOpen} />;
}

describe("formatKeys", () => {
  // Oracle: T3.3 R3 defines Windows key names and explicit plus separators.
  it.each([
    ["save", ["Ctrl", "+", "S"]],
    ["previous-field", ["Shift", "+", "Tab"]],
    ["previous-page", ["PgUp"]],
    ["open-shortcuts", ["Shift", "+", "?"]],
  ])("formats %s as the expected display chips", (id, expected) => {
    expect(formatKeys(shortcut(id))).toEqual(expected);
  });

  it("includes keyboard and numpad alternatives for zoom in", () => {
    expect(formatKeys(shortcut("zoom-in"))).toEqual([
      "Ctrl",
      "+",
      "+",
      "/",
      "=",
      "/",
      "Num +",
    ]);
  });

  it("keeps explicit common keys and resolves bare labels to workspace", () => {
    expect(shortcutTranslationKey(shortcut("save"))).toBe("common:save");
    expect(shortcutTranslationKey(shortcut("next-field"))).toBe(
      "workspace:shortcuts.next_field",
    );
  });
});

describe("ShortcutOverlay", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("sk");
  });

  // Oracle: T3.3 R1/R6 requires the rendered catalog to stay in lockstep
  // with every registered row, including duplicate actions with different keys.
  it("renders every WORKSPACE_SHORTCUTS row from the table", () => {
    render(<ShortcutOverlay open onOpenChange={() => {}} />);

    for (const row of WORKSPACE_SHORTCUTS) {
      const renderedRow = document.querySelector(`[data-shortcut-id="${row.id}"]`);
      expect(renderedRow, `missing rendered shortcut row ${row.id}`).not.toBeNull();
      expect(
        within(renderedRow as HTMLElement).getByText(
          i18n.t(shortcutTranslationKey(row)),
        ),
      ).toBeInTheDocument();
    }
  });

  it("renders translated groups in the fixed order", () => {
    render(<ShortcutOverlay open onOpenChange={() => {}} />);
    const headings = screen.getAllByRole("heading", { level: 3 });
    expect(headings.map((heading) => heading.textContent)).toEqual(
      SHORTCUT_GROUP_ORDER.map((group) => i18n.t(`workspace:shortcuts.groups.${group}`)),
    );
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    render(<OverlayHarness />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes from the localized close button", async () => {
    const user = userEvent.setup();
    render(<OverlayHarness />);

    await user.click(screen.getByRole("button", { name: "Zavrieť" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
