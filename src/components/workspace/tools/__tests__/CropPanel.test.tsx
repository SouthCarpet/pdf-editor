import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "@/i18n";
import { historyStore } from "@/stores/historyStore";
import { CropPanel, type CropRect } from "../CropPanel";
import { CROP_PREVIEW_BOX, cropPreviewClip, presetA4 } from "../cropModel";

const DOC = "A:\\docs\\crop.pdf";
const PAGE = { width: 400, height: 600 };
const INITIAL: CropRect = { x: 20, y: 20, width: 360, height: 560 };

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  cropPdfCmd: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: (...args: unknown[]) => mocks.save(...args),
}));
vi.mock("@/bindings", () => ({
  commands: { cropPdfCmd: (...args: unknown[]) => mocks.cropPdfCmd(...args) },
}));
vi.mock("@/hooks/usePdfDocument", () => ({
  usePdfDocument: (path: string | null) =>
    path ? { pdf: { numPages: 1 }, numPages: 1 } : null,
}));
vi.mock("../../PdfViewer", () => ({
  PdfViewer: () => <div data-testid="crop-preview-page" />,
}));

function Harness() {
  const [rect, setRect] = useState<CropRect>(INITIAL);
  return (
    <CropPanel
      docPath={DOC}
      pageWidth={PAGE.width}
      pageHeight={PAGE.height}
      rect={rect}
      onRectChange={(next) => setRect(next)}
    />
  );
}

describe("CropPanel", () => {
  beforeEach(async () => {
    historyStore.setState({ byDoc: {} });
    mocks.save.mockReset();
    mocks.cropPdfCmd.mockReset();
    await i18n.changeLanguage("en");
  });

  it("pushes Orezanie history when a preset is applied", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "A4" }));
    expect(historyStore.getState().byDoc[DOC].undo).toHaveLength(1);
    expect(historyStore.getState().byDoc[DOC].undo[0].label).toBe("Orezanie");
    const a4 = presetA4(PAGE);
    expect(a4.width).toBeGreaterThan(0);
  });

  it("clears history after a successful Apply (T2.2)", async () => {
    const user = userEvent.setup();
    mocks.save.mockResolvedValue("A:\\docs\\out.cropped.pdf");
    mocks.cropPdfCmd.mockResolvedValue({ status: "ok", data: { bbox_applied: [0, 0, 1, 1] } });
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "A4" }));
    expect(historyStore.getState().canUndo(DOC)).toBe(true);
    await user.click(screen.getByRole("button", { name: "Apply crop" }));
    expect(historyStore.getState().canUndo(DOC)).toBe(false);
  });

  it("clips the live preview to the crop rectangle in the fit box", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("checkbox", { name: "Preview" }));
    const preview = screen.getByTestId("crop-preview");
    const clip = cropPreviewClip(INITIAL, PAGE, CROP_PREVIEW_BOX);
    expect(preview).toHaveStyle({
      clipPath: `inset(${clip.inset.top}px ${clip.inset.right}px ${clip.inset.bottom}px ${clip.inset.left}px)`,
    });
    expect(screen.getByTestId("crop-preview-page")).toBeInTheDocument();
  });
});
