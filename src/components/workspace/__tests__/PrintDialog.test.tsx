import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import i18n from "@/i18n";
import { PrintDialog } from "../PrintDialog";

vi.mock("@tauri-apps/api/path", () => ({
  tempDir: vi.fn(),
  join: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-fs", () => ({
  readFile: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("@/bindings", () => ({
  commands: { renderPageThumbnail: vi.fn() },
}));
vi.mock("@/lib/documentSave", () => ({
  writePendingAnnotationsCopy: vi.fn(),
}));

describe("PrintDialog", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("sk");
  });

  // Oracle: T4.4 R1/R6 forbids printing without an open document.
  it("disables the primary print action when no document is open", async () => {
    render(
      <PrintDialog
        open
        path=""
        pageCount={0}
        disabled
        onOpenChange={vi.fn()}
      />,
    );

    expect(await screen.findByRole("button", { name: "Tlačiť" })).toBeDisabled();
  });

  // Oracle: direction 1 has no vector route and must not fake the switch.
  it("shows print-as-image as always on and disabled", async () => {
    render(
      <PrintDialog
        open
        path="A:\\docs\\a.pdf"
        pageCount={1}
        onOpenChange={vi.fn()}
      />,
    );

    const imageSwitch = await screen.findByRole("switch", { name: "Tlačiť ako obrázok" });
    expect(imageSwitch).toHaveAttribute("aria-checked", "true");
    expect(imageSwitch).toBeDisabled();
  });
});
