import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "@/i18n";
import { historyStore } from "@/stores/historyStore";
import { CropPanel, type CropRect } from "../CropPanel";
import { CROP_PREVIEW_BOX, cropPreviewClip, presetA4, presetFullPage } from "../cropModel";

const DOC = "A:\\docs\\crop.pdf";
const PAGE = { width: 400, height: 600 };
const INITIAL: CropRect = { x: 20, y: 20, width: 360, height: 560 };

function PageHarness({
  page,
  rect: initial,
}: {
  page: { width: number; height: number };
  rect: CropRect;
}) {
  const [rect, setRect] = useState<CropRect>(initial);
  return (
    <CropPanel
      docPath={DOC}
      pageWidth={page.width}
      pageHeight={page.height}
      rect={rect}
      onRectChange={(next) => setRect(next)}
    />
  );
}

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

  it("pushes crop history when a preset is applied", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "A4" }));
    expect(historyStore.getState().byDoc[DOC].undo).toHaveLength(1);
    expect(historyStore.getState().byDoc[DOC].undo[0].label).toBe("crop");
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

  it("sends real PDF points to crop_pdf_cmd, not on-screen pixels (F1 regression)", async () => {
    // Workspace now always gives CropPanel `basePageSize` (PDF points),
    // never the zoom-scaled render size. A 612x792 page rendered at
    // zoom 1.5 is 918x1188 on screen, but the panel only ever sees
    // 612x792, so a full-page crop must send exactly that, regardless of
    // what zoom the overlay happened to be drawn at.
    const user = userEvent.setup();
    mocks.save.mockResolvedValue("A:\\docs\\points.cropped.pdf");
    mocks.cropPdfCmd.mockResolvedValue({
      status: "ok",
      data: { bbox_applied: [0, 0, 612, 792] },
    });
    const page = { width: 612, height: 792 };
    render(<PageHarness page={page} rect={presetFullPage(page)} />);
    await user.click(screen.getByRole("button", { name: "Apply crop" }));
    expect(mocks.cropPdfCmd).toHaveBeenCalledWith(
      expect.objectContaining({ bbox: [0, 0, 612, 792] }),
    );
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
