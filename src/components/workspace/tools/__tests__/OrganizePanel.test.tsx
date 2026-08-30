import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as pdfjs from "pdfjs-dist";
import i18n from "@/i18n";
import { historyStore } from "@/stores/historyStore";
import { OrganizePanel } from "../OrganizePanel";

vi.mock("../../PdfViewer", () => ({
  PdfViewer: ({ pageIndex }: { pageIndex: number }) => (
    <div data-testid={`thumb-${pageIndex}`} />
  ),
}));
vi.mock("@/tauri/bridge", async () => (await import("@/test/fakeTauriBridge")).fakeBridge);
vi.mock("@/bindings", () => ({
  commands: {
    openDocument: vi.fn(),
    reorderPagesCmd: vi.fn(),
    rotatePagesCmd: vi.fn(),
    extractPagesCmd: vi.fn(),
    mergePdfsCmd: vi.fn(),
    insertBlankPageCmd: vi.fn(),
    saveDocument: vi.fn(),
  },
}));

const DOC = "A:\\docs\\order.pdf";
const pdf = { numPages: 4 } as unknown as pdfjs.PDFDocumentProxy;

describe("OrganizePanel selection and undo", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    historyStore.setState({ byDoc: {} });
  });

  it("Shift-click selects a range from the anchor and Ctrl-click toggles", async () => {
    render(<OrganizePanel pdf={pdf} docPath={DOC} />);
    const cards = screen.getAllByRole("option");

    fireEvent.click(cards[0]);
    expect(cards[0]).toHaveAttribute("aria-selected", "true");

    fireEvent.click(cards[2], { shiftKey: true });
    expect(cards.map((card) => card.getAttribute("aria-selected"))).toEqual([
      "true",
      "true",
      "true",
      "false",
    ]);

    fireEvent.click(cards[3], { ctrlKey: true });
    expect(cards[3]).toHaveAttribute("aria-selected", "true");

    fireEvent.click(cards[3], { ctrlKey: true });
    expect(cards[3]).toHaveAttribute("aria-selected", "false");
    expect(cards[0]).toHaveAttribute("aria-selected", "true");
  });

  it("Reverse order pushes a page-order history entry that undo restores", async () => {
    const user = userEvent.setup();
    render(<OrganizePanel pdf={pdf} docPath={DOC} />);

    await user.click(screen.getByRole("button", { name: "Reverse order" }));

    expect(historyStore.getState().byDoc[DOC]?.undo.at(-1)?.label).toBe("organize");
    const after = screen.getAllByTestId(/thumb-/).map((node) => node.getAttribute("data-testid"));
    expect(after).toEqual(["thumb-3", "thumb-2", "thumb-1", "thumb-0"]);

    act(() => {
      historyStore.getState().undo(DOC);
    });
    const restored = screen.getAllByTestId(/thumb-/).map((node) => node.getAttribute("data-testid"));
    expect(restored).toEqual(["thumb-0", "thumb-1", "thumb-2", "thumb-3"]);
  });
});
