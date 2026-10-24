// Plan 062 T1.2 + T1.4: two defects Michal reported against the built app.
//
//   1. The OCR-detected scan prompt opened automatically on every document
//      open, scanned or not, with no way to make it stop. Fixed by removing
//      the auto-open call in `WorkspaceRoute` - the dialog now opens only
//      from the Text panel's existing explicit "Spustiť OCR" action (already
//      covered by `EditTextPanel.test.tsx`). No "do not show again" banner
//      was added: the explicit action already existed and is the simplest
//      fix that satisfies R1, so there is nothing to remember not to show.
//   2. OCR writes a separate searchable PDF and leaves the open document
//      untouched, so the Text panel kept reporting "no text layer" even
//      after OCR completed. Fixed by opening the OCR output once the job
//      succeeds (closing the scanned original, since a tab is identified by
//      its file path and cannot be swapped in place).
//
// Follows the render pattern and Tauri-bridge mocking already established
// by `WorkspaceRoute.updateDepth.test.tsx`.
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import "@/i18n";
import i18n from "@/i18n";
import { routeTree } from "@/routeTree.gen";
import { useAnnotations } from "@/stores/annotationsStore";
import { useDocuments } from "@/stores/documentStore";
import { useWorkspace } from "@/stores/workspaceStore";
import { useCloseGuard } from "@/stores/closeGuardStore";

const SEPARATOR = String.fromCharCode(92);
const DOC_PATH = ["A:", "scans", "timesheet-scan.pdf"].join(SEPARATOR);
const OCR_OUT = ["A:", "scans", "timesheet-scan.ocr.pdf"].join(SEPARATOR);

vi.mock("@/tauri/bridge", async () => (await import("@/test/fakeTauriBridge")).fakeBridge);

const commandFakes = vi.hoisted(() => ({
  openDocument: vi.fn(),
  detectScannedPdf: vi.fn(),
  extractRunsCmd: vi.fn(),
  ocrPdfCmd: vi.fn(),
  // Unlike the other commands mocked here, `listOcrBackends` is not
  // typedError-wrapped (`OcrBackendInfo[]`, not `{status,data}`) - the
  // Proxy default below would hand `useOcrBackends` a `{status,data}`
  // object and its `.find` call would throw. This has to return a plain
  // array.
  listOcrBackends: vi.fn(async () => []),
}));
vi.mock("@/bindings", () => ({
  Channel: class {},
  commands: new Proxy(commandFakes, {
    get(target, property: string) {
      if (property in target) return target[property as keyof typeof target];
      return vi.fn(async () => ({ status: "ok", data: [] }));
    },
  }),
}));

// The real hook needs the pdf.js worker, which jsdom has no use for.
vi.mock("@/hooks/usePdfDocument", () => ({
  usePdfDocument: (path: string | null) =>
    path
      ? {
          pdf: {
            numPages: 1,
            getPage: async () => ({ getViewport: () => ({ width: 600, height: 850 }) }),
          },
          numPages: 1,
        }
      : null,
}));

import { fakeBridge, resetFakeBridge } from "@/test/fakeTauriBridge";

function renderWorkspace(initialPath = DOC_PATH) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: ["/workspace/" + encodeURIComponent(initialPath)],
    }),
  });
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router as never} />
    </QueryClientProvider>,
  );
}

function scannedOcrResult() {
  return {
    status: "ok" as const,
    data: {
      output_paths: [OCR_OUT],
      pages_processed: 1,
      characters_recognized: 245,
      average_confidence: 90,
      page_confidences: [],
      low_confidence_pages: [],
      cache_hits: 0,
      engine: "tesseract",
      backend_notice: null,
    },
  };
}

describe("workspace route OCR flow (plan 062 T1.2/T1.4)", () => {
  beforeAll(() => {
    if (typeof window.matchMedia !== "function") {
      Object.defineProperty(window, "matchMedia", {
        value: (query: string) => ({
          matches: false,
          media: query,
          onchange: null,
          addListener: () => {},
          removeListener: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => false,
        }),
      });
    }
    if (typeof window.ResizeObserver !== "function") {
      window.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      };
    }
  });

  beforeEach(async () => {
    await i18n.changeLanguage("sk");
    vi.clearAllMocks();
    resetFakeBridge();

    commandFakes.openDocument.mockImplementation(async (p: string) => ({
      status: "ok",
      data: { path: p, page_count: 1 },
    }));
    // The original is a scan with no text layer; the OCR output is not.
    commandFakes.detectScannedPdf.mockImplementation(async (p: string) => ({
      status: "ok",
      data: { is_likely_scanned: p !== OCR_OUT, avg_chars_per_page: p === OCR_OUT ? 300 : 0, total_pages: 1 },
    }));
    commandFakes.extractRunsCmd.mockImplementation(async (p: string) => ({
      status: "ok",
      data:
        p === OCR_OUT
          ? [
              {
                page: 0,
                text: "timesheet-scan",
                bbox: [0, 0, 10, 10],
                operator_index: 0,
                font: "Helvetica",
                font_size: 12,
              },
            ]
          : [],
    }));
    commandFakes.ocrPdfCmd.mockResolvedValue(scannedOcrResult());

    useDocuments.setState({ documents: new Map(), activeDocId: null });
    useAnnotations.setState({ byDoc: {}, mode: "highlight" });
    useCloseGuard.setState({ request: null });
    useWorkspace.setState({
      activeTool: "edit",
      editSubTool: "text",
      activePage: 0,
      zoomByDoc: {},
      ocrPromptOpen: false,
      autoDetectFormsRequest: 0,
    });
    localStorage.setItem("onboarded", "1");
  });

  it("does not open the OCR prompt automatically when a scanned document opens (R1)", async () => {
    renderWorkspace();

    // The Text panel's own scan detection still runs (it drives the
    // scanned-page empty state) - what must NOT happen is the dialog
    // opening on its own. Wait for that detection to resolve, then assert
    // the store never flipped - this is the exact defect Michal reported
    // (the prompt appeared every time, unconditionally).
    await screen.findAllByText(/timesheet-scan\.pdf/);
    await waitFor(() => expect(commandFakes.detectScannedPdf).toHaveBeenCalledWith(DOC_PATH));
    expect(useWorkspace.getState().ocrPromptOpen).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens the OCR dialog only from the Text panel's explicit action (R1)", async () => {
    const user = userEvent.setup();
    renderWorkspace();

    const trigger = await screen.findByRole("button", { name: "Spustiť OCR" });
    expect(screen.queryByRole("dialog")).toBeNull();

    await user.click(trigger);

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(useWorkspace.getState().ocrPromptOpen).toBe(true);
  });

  it("opens the OCR output, refreshes the scanned state, and does not duplicate the recent-files entry (R2, R3)", async () => {
    fakeBridge.pickSavePath.mockResolvedValue(OCR_OUT);
    useWorkspace.getState().setZoom(DOC_PATH, 2);
    const user = userEvent.setup();
    renderWorkspace();

    await user.click(await screen.findByRole("button", { name: "Spustiť OCR" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Spustiť OCR" }));

    // The scanned tab is replaced by the OCR output tab.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await screen.findAllByText(/timesheet-scan\.ocr\.pdf/);
    expect(useDocuments.getState().documents.has(DOC_PATH)).toBe(false);
    expect(useDocuments.getState().documents.has(OCR_OUT)).toBe(true);
    expect(useDocuments.getState().activeDocId).toBe(OCR_OUT);

    // R3: openDocument (which persists the recent-files entry server-side,
    // upserting on path) is called exactly once for the OCR output.
    expect(
      commandFakes.openDocument.mock.calls.filter(([p]) => p === OCR_OUT),
    ).toHaveLength(1);

    // Zoom carries over to the new tab.
    expect(useWorkspace.getState().getZoom(OCR_OUT)).toBe(2);

    // The Text panel now sees the OCR file's real text run, not the
    // "scanned, no text layer" empty state.
    await screen.findByText("p1");
    expect(screen.queryByText("Táto strana je naskenovaný obrázok")).toBeNull();

    // The toast names the output file.
    const toast = screen.getByRole("status");
    expect(within(toast).getByText(/timesheet-scan\.ocr\.pdf/)).toBeInTheDocument();
  });

  it("asks before swapping when the original has unsaved work, and cancelling keeps it open (R2)", async () => {
    fakeBridge.pickSavePath.mockResolvedValue(OCR_OUT);
    const user = userEvent.setup();
    renderWorkspace();

    const trigger = await screen.findByRole("button", { name: "Spustiť OCR" });
    // Simulate an in-progress (not yet Applied) Edit Text draft, the same
    // source `hasUnsavedWork` reads for the window/tab close guard. Set
    // only after the document is confirmed loaded (the trigger button
    // only renders once `documentStore` has the entry `markDirty` needs).
    useDocuments.getState().markDirty(DOC_PATH, true);

    await user.click(trigger);
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Spustiť OCR" }));

    const guard = await screen.findByRole("dialog");
    expect(within(guard).getByText(/timesheet-scan\.pdf/)).toBeInTheDocument();
    // Nothing swapped yet while the guard is up.
    expect(useDocuments.getState().documents.has(DOC_PATH)).toBe(true);
    expect(commandFakes.openDocument.mock.calls.some(([p]) => p === OCR_OUT)).toBe(false);

    await user.click(within(guard).getByRole("button", { name: "Zrušiť" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(useDocuments.getState().documents.has(DOC_PATH)).toBe(true);
    expect(useDocuments.getState().documents.has(OCR_OUT)).toBe(false);
    expect(commandFakes.openDocument.mock.calls.some(([p]) => p === OCR_OUT)).toBe(false);
  });
});
