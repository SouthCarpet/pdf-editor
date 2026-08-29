import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import { OcrEditPanel } from "../OcrEditPanel";

const mocks = vi.hoisted(() => ({
  editOcrPageWordsCmd: vi.fn(),
  clearSelection: vi.fn(),
}));

vi.mock("@/bindings", () => ({
  commands: {
    editOcrPageWordsCmd: mocks.editOcrPageWordsCmd,
  },
}));

vi.mock("@/tauri/bridge", async () => (await import("@/test/fakeTauriBridge")).fakeBridge);

import { fakeBridge, resetFakeBridge } from "@/test/fakeTauriBridge";

describe("OcrEditPanel", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    resetFakeBridge();
    await i18n.changeLanguage("en");
    fakeBridge.pickSavePath.mockResolvedValue("D:\\output\\scan.ocr-edited.pdf");
  });

  it("sends selected OCR word ids for erase", async () => {
    const user = userEvent.setup();
    mocks.editOcrPageWordsCmd.mockResolvedValue({
      status: "ok",
      data: {
        output_path: "D:\\output\\scan.ocr-edited.pdf",
        removed_word_ids: [2, 3],
        skipped_word_ids: [],
        cache_invalidated: true,
      },
    });
    render(
      <OcrEditPanel
        docPath={"D:\\input\\scan.pdf"}
        pageIndex={4}
        words={[]}
        selectedIds={new Set([2, 3])}
        loading={false}
        layerNotice={null}
        onClearSelection={mocks.clearSelection}
      />
    );

    await user.click(screen.getByRole("button", { name: "Erase selected words" }));

    await waitFor(() =>
      expect(mocks.editOcrPageWordsCmd).toHaveBeenCalledWith({
        input: "D:\\input\\scan.pdf",
        output: "D:\\output\\scan.ocr-edited.pdf",
        page_index: 4,
        word_ids: [2, 3],
        replacement: null,
      })
    );
    expect(
      await screen.findByText(/matching invisible OCR spans were removed/i)
    ).toBeInTheDocument();
    expect(mocks.clearSelection).toHaveBeenCalled();
  });

  it("reports the patch-only fallback honestly", async () => {
    const user = userEvent.setup();
    mocks.editOcrPageWordsCmd.mockResolvedValue({
      status: "ok",
      data: {
        output_path: "D:\\output\\scan.ocr-edited.pdf",
        removed_word_ids: [],
        skipped_word_ids: [7],
        cache_invalidated: true,
      },
    });
    render(
      <OcrEditPanel
        docPath={"D:\\input\\scan.pdf"}
        pageIndex={0}
        words={[]}
        selectedIds={new Set([7])}
        loading={false}
        layerNotice={null}
        onClearSelection={mocks.clearSelection}
      />
    );

    await user.click(screen.getByRole("button", { name: "Erase selected words" }));

    expect(await screen.findByText(/span removal was skipped/i)).toBeInTheDocument();
    expect(screen.getByText(/white patch was added/i)).toBeInTheDocument();
  });
});
