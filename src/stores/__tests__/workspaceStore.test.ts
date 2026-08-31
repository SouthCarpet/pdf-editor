import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "../appStore";
import {
  useWorkspace,
  zoomForMode,
  ZOOM_DEFAULT,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STEP,
} from "../workspaceStore";

const DOC_A = "A:\\docs\\a.pdf";
const DOC_B = "A:\\docs\\b.pdf";

describe("workspaceStore", () => {
  beforeEach(() => {
    useWorkspace.setState({
      activeTool: "edit",
      editSubTool: "forms",
      activePage: 0,
      zoomByDoc: {},
      zoomModeByDoc: {},
      bookModeByDoc: {},
      thumbnailStripCollapsed: false,
    });
    useAppStore.setState({ defaultZoom: ZOOM_DEFAULT });
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

  it("getZoom falls back to appStore defaultZoom instead of the ZOOM_DEFAULT constant", () => {
    useAppStore.setState({ defaultZoom: 1.5 });
    expect(useWorkspace.getState().getZoom(DOC_A)).toBe(1.5);
    useWorkspace.getState().setZoom(DOC_A, 2);
    expect(useWorkspace.getState().getZoom(DOC_A)).toBe(2);
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

  // Oracle: T3.1 R4 defines mode as per-document state, defaulting to custom.
  it("keeps zoom modes independent per document", () => {
    useWorkspace.getState().setZoomMode(DOC_A, "fit-width");
    expect(useWorkspace.getState().getZoomMode(DOC_A)).toBe("fit-width");
    expect(useWorkspace.getState().getZoomMode(DOC_B)).toBe("custom");
  });

  // Oracle: T3.1 R4 says fit recomputation preserves mode, while a numeric
  // user zoom switches back to custom from the current derived value.
  it("fit recomputation preserves mode and a zoom step switches to custom", () => {
    useWorkspace.getState().setZoomMode(DOC_A, "fit-page");
    useWorkspace.getState().applyZoomForMode(DOC_A, 0.75);
    expect(useWorkspace.getState().getZoom(DOC_A)).toBe(0.75);
    expect(useWorkspace.getState().getZoomMode(DOC_A)).toBe("fit-page");

    useWorkspace.getState().zoomIn(DOC_A);
    expect(useWorkspace.getState().getZoom(DOC_A)).toBe(0.85);
    expect(useWorkspace.getState().getZoomMode(DOC_A)).toBe("custom");
  });

  it("resetZoom switches a fit mode back to custom at 100%", () => {
    useWorkspace.getState().setZoomMode(DOC_A, "fit-width");
    useWorkspace.getState().applyZoomForMode(DOC_A, 1.5);
    useWorkspace.getState().resetZoom(DOC_A);
    expect(useWorkspace.getState().getZoom(DOC_A)).toBe(ZOOM_DEFAULT);
    expect(useWorkspace.getState().getZoomMode(DOC_A)).toBe("custom");
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

  // Oracle: T3.2 R2 makes book mode session-only and snaps a right page to
  // its spread's left page when the mode is enabled.
  it("keeps book mode off by default and independent per document", () => {
    expect(useWorkspace.getState().bookModeByDoc[DOC_A] ?? false).toBe(false);
    useWorkspace.getState().setBookMode(DOC_A, true);
    expect(useWorkspace.getState().bookModeByDoc[DOC_A]).toBe(true);
    expect(useWorkspace.getState().bookModeByDoc[DOC_B] ?? false).toBe(false);
  });

  it("snaps an even zero-based page onto the left side when enabling book mode", () => {
    useWorkspace.getState().setActivePage(4);
    useWorkspace.getState().setBookMode(DOC_A, true);
    expect(useWorkspace.getState().activePage).toBe(3);
  });

  it("keeps the cover focused when enabling book mode", () => {
    useWorkspace.getState().setActivePage(0);
    useWorkspace.getState().setBookMode(DOC_A, true);
    expect(useWorkspace.getState().activePage).toBe(0);
  });

  it("keeps the focused page when disabling book mode", () => {
    useWorkspace.getState().setBookMode(DOC_A, true);
    useWorkspace.getState().setActivePage(2);
    useWorkspace.getState().setBookMode(DOC_A, false);
    expect(useWorkspace.getState().activePage).toBe(2);
  });

  it("keeps a right-page focus when book mode is already on", () => {
    useWorkspace.getState().setBookMode(DOC_A, true);
    useWorkspace.getState().setActivePage(2);
    useWorkspace.getState().setBookMode(DOC_A, true);
    expect(useWorkspace.getState().activePage).toBe(2);
  });
});

describe("zoomForMode", () => {
  // Oracle: T3.1 R4 defines width fit as box/page width and page fit as
  // the smaller width/height ratio. Values use the brief's page/box cases.
  it.each([
    ["fit-width", { width: 600, height: 800 }, { width: 1200, height: 700 }, 2],
    ["fit-page", { width: 600, height: 800 }, { width: 1200, height: 700 }, 0.88],
    ["fit-width", { width: 600, height: 800 }, { width: 300, height: 900 }, 0.5],
    ["fit-page", { width: 600, height: 800 }, { width: 300, height: 900 }, 0.5],
    ["fit-width", { width: 800, height: 600 }, { width: 1200, height: 700 }, 1.5],
    ["fit-page", { width: 800, height: 600 }, { width: 1200, height: 700 }, 1.17],
    ["fit-width", { width: 800, height: 600 }, { width: 300, height: 900 }, 0.38],
    ["fit-page", { width: 800, height: 600 }, { width: 300, height: 900 }, 0.38],
  ] as const)("derives %s for page %o in box %o", (mode, page, box, expected) => {
    expect(zoomForMode(mode, page, box)).toBeCloseTo(expected, 2);
  });

  it("does not derive a numeric zoom for custom mode", () => {
    expect(zoomForMode("custom", { width: 600, height: 800 }, { width: 1200, height: 700 })).toBeNull();
  });

  // Oracle: T3.2 R5 fits the two page widths around a fixed 8 px gap and
  // uses the tallest facing page for whole-spread fitting.
  it("fits a facing pair and its fixed gap to width", () => {
    expect(
      zoomForMode("fit-width", { width: 1200, height: 800 }, { width: 908, height: 700 }, 8),
    ).toBe(0.75);
  });

  it("fits the whole facing pair box using its tallest page", () => {
    expect(
      zoomForMode("fit-page", { width: 1200, height: 1000 }, { width: 1208, height: 700 }, 8),
    ).toBe(0.7);
  });
});
