import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as pdfjs from "pdfjs-dist";
import { commands } from "@/bindings";
import i18n from "@/i18n";
import { historyStore } from "@/stores/historyStore";
import { useOrganizeStore } from "@/stores/organizeStore";
import { fakeBridge, resetFakeBridge } from "@/test/fakeTauriBridge";
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
    useOrganizeStore.setState({ byDoc: {} });
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

  it("undo still applies after the panel unmounts (F4 regression: tool switch)", async () => {
    // The panel unmounts when Workspace switches away from the Organize
    // tool. Before the fix, undo/redo closed over the panel's own
    // `setState`, so an undo fired after unmount was a silent no-op.
    const user = userEvent.setup();
    const { unmount } = render(<OrganizePanel pdf={pdf} docPath={DOC} />);
    await user.click(screen.getByRole("button", { name: "Reverse order" }));
    expect(historyStore.getState().canUndo(DOC)).toBe(true);

    unmount();
    act(() => {
      historyStore.getState().undo(DOC);
    });
    expect(useOrganizeStore.getState().byDoc[DOC]?.org.pages.map((p) => p.originalIndex)).toEqual([
      0, 1, 2, 3,
    ]);

    render(<OrganizePanel pdf={pdf} docPath={DOC} />);
    const restored = screen.getAllByTestId(/thumb-/).map((node) => node.getAttribute("data-testid"));
    expect(restored).toEqual(["thumb-0", "thumb-1", "thumb-2", "thumb-3"]);
  });
});

describe("OrganizePanel apply plan", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    historyStore.setState({ byDoc: {} });
    useOrganizeStore.setState({ byDoc: {} });
    resetFakeBridge();
    vi.mocked(commands.reorderPagesCmd).mockReset();
    vi.mocked(commands.insertBlankPageCmd).mockReset();
    vi.mocked(commands.saveDocument).mockReset();
  });

  it("Apply after deleting every original and inserting a blank reorders empty then inserts", async () => {
    const ok = { status: "ok" as const, data: { output_paths: ["stage.pdf"] } };
    fakeBridge.pickSavePath.mockResolvedValue("A:\\docs\\order.organized.pdf");
    vi.mocked(commands.reorderPagesCmd).mockResolvedValue(ok);
    vi.mocked(commands.insertBlankPageCmd).mockResolvedValue(ok);
    vi.mocked(commands.saveDocument).mockResolvedValue({ status: "ok", data: null });

    const user = userEvent.setup();
    render(<OrganizePanel pdf={pdf} docPath={DOC} />);
    const cards = screen.getAllByRole("option");
    fireEvent.click(cards[0]);
    fireEvent.click(cards[3], { shiftKey: true });
    await user.click(screen.getByRole("button", { name: "Delete selected" }));
    await user.click(screen.getAllByRole("button", { name: "Insert blank page after" })[0]);
    await user.click(screen.getByRole("button", { name: "Apply changes" }));

    await waitFor(() => {
      expect(commands.reorderPagesCmd).toHaveBeenCalled();
    });
    expect(vi.mocked(commands.reorderPagesCmd).mock.calls[0]?.[0]).toMatchObject({
      new_order: [],
    });
    expect(vi.mocked(commands.insertBlankPageCmd).mock.calls[0]?.[0]).toMatchObject({
      after_page_index: -1,
    });
  });
});

