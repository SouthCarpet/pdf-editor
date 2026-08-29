import { describe, it, expect, beforeEach } from "vitest";
import { useWorkspace, ZOOM_DEFAULT, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from "../workspaceStore";

const DOC_A = "A:\\docs\\a.pdf";
const DOC_B = "A:\\docs\\b.pdf";

describe("workspaceStore", () => {
  beforeEach(() => {
    useWorkspace.setState({
      activeTool: "edit",
      editSubTool: "forms",
      activePage: 0,
      zoomByDoc: {},
      thumbnailStripCollapsed: false,
    });
  });

  it("setTool changes the active workspace tool", () => {
    useWorkspace.getState().setTool("crop");
    expect(useWorkspace.getState().activeTool).toBe("crop");
  });

  it("setEditSubTool switches between forms/annotations/text", () => {
    useWorkspace.getState().setEditSubTool("text");
    expect(useWorkspace.getState().editSubTool).toBe("text");
  });

  it("setActivePage clamps negatives to 0", () => {
    useWorkspace.getState().setActivePage(-5);
    expect(useWorkspace.getState().activePage).toBe(0);
  });

  // Plan 060 task T1 (R1/R4): zoom is per document and defaults to 100%
  // for a document that was never touched.
  it("getZoom defaults to ZOOM_DEFAULT (100%) for an unseen document", () => {
    expect(useWorkspace.getState().getZoom(DOC_A)).toBe(ZOOM_DEFAULT);
  });

  it("setZoom clamps below ZOOM_MIN", () => {
    useWorkspace.getState().setZoom(DOC_A, 0.01);
    expect(useWorkspace.getState().getZoom(DOC_A)).toBe(ZOOM_MIN);
  });

  it("setZoom clamps above ZOOM_MAX", () => {
    useWorkspace.getState().setZoom(DOC_A, 100);
    expect(useWorkspace.getState().getZoom(DOC_A)).toBe(ZOOM_MAX);
  });

  it("setZoom accepts mid-range values verbatim", () => {
    useWorkspace.getState().setZoom(DOC_A, 1.75);
    expect(useWorkspace.getState().getZoom(DOC_A)).toBe(1.75);
  });

  it("zoomIn steps up by ZOOM_STEP from the default", () => {
    useWorkspace.getState().zoomIn(DOC_A);
    expect(useWorkspace.getState().getZoom(DOC_A)).toBeCloseTo(ZOOM_DEFAULT + ZOOM_STEP, 5);
  });

  it("zoomOut steps down by ZOOM_STEP from the default", () => {
    useWorkspace.getState().zoomOut(DOC_A);
    expect(useWorkspace.getState().getZoom(DOC_A)).toBeCloseTo(ZOOM_DEFAULT - ZOOM_STEP, 5);
  });

  it("repeated zoomIn steps never drift off a round percentage", () => {
    for (let i = 0; i < 5; i++) useWorkspace.getState().zoomIn(DOC_A);
    // 1.0 + 5*0.1 = 1.5, not 1.4999999999999998 (floating point drift).
    expect(useWorkspace.getState().getZoom(DOC_A)).toBe(1.5);
  });

  it("zoomIn clamps at ZOOM_MAX instead of overshooting", () => {
    useWorkspace.getState().setZoom(DOC_A, ZOOM_MAX);
    useWorkspace.getState().zoomIn(DOC_A);
    expect(useWorkspace.getState().getZoom(DOC_A)).toBe(ZOOM_MAX);
  });

  it("zoomOut clamps at ZOOM_MIN instead of undershooting", () => {
    useWorkspace.getState().setZoom(DOC_A, ZOOM_MIN);
    useWorkspace.getState().zoomOut(DOC_A);
    expect(useWorkspace.getState().getZoom(DOC_A)).toBe(ZOOM_MIN);
  });

  it("resetZoom (Ctrl+0) restores ZOOM_DEFAULT after zooming", () => {
    useWorkspace.getState().setZoom(DOC_A, 2.5);
    useWorkspace.getState().resetZoom(DOC_A);
    expect(useWorkspace.getState().getZoom(DOC_A)).toBe(ZOOM_DEFAULT);
  });

  it("zoom is independent per document", () => {
    useWorkspace.getState().setZoom(DOC_A, 2);
    expect(useWorkspace.getState().getZoom(DOC_B)).toBe(ZOOM_DEFAULT);
    useWorkspace.getState().zoomIn(DOC_B);
    expect(useWorkspace.getState().getZoom(DOC_A)).toBe(2);
    expect(useWorkspace.getState().getZoom(DOC_B)).toBeCloseTo(ZOOM_DEFAULT + ZOOM_STEP, 5);
  });

  // Plan 050 task D2-UX (R4): the Text tool's scanned-page empty state
  // drives these two through the store instead of prop-drilling callbacks
  // down from `WorkspaceRoute`.
  it("openOcrPrompt/closeOcrPrompt toggle the scanned-page OCR dialog", () => {
    expect(useWorkspace.getState().ocrPromptOpen).toBe(false);
    useWorkspace.getState().openOcrPrompt();
    expect(useWorkspace.getState().ocrPromptOpen).toBe(true);
    useWorkspace.getState().closeOcrPrompt();
    expect(useWorkspace.getState().ocrPromptOpen).toBe(false);
  });

  it("requestAutoDetectForms increments a one-shot counter", () => {
    expect(useWorkspace.getState().autoDetectFormsRequest).toBe(0);
    useWorkspace.getState().requestAutoDetectForms();
    expect(useWorkspace.getState().autoDetectFormsRequest).toBe(1);
    useWorkspace.getState().requestAutoDetectForms();
    expect(useWorkspace.getState().autoDetectFormsRequest).toBe(2);
  });

  // Plan 062 T1.5: collapse is session state on this store (wiped on reload).
  it("thumbnail strip collapse defaults to expanded and remembers a toggle", () => {
    expect(useWorkspace.getState().thumbnailStripCollapsed).toBe(false);
    useWorkspace.getState().setThumbnailStripCollapsed(true);
    expect(useWorkspace.getState().thumbnailStripCollapsed).toBe(true);
    useWorkspace.getState().setThumbnailStripCollapsed(false);
    expect(useWorkspace.getState().thumbnailStripCollapsed).toBe(false);
  });
});
