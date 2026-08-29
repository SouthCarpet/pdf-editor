// Regression guard for the React #185 crash reported on 2026-08-18 (plan 050).
//
// Opening a scanned PDF and switching the Edit panel to Annotations put the
// app in the error boundary with "Maximum update depth exceeded". The store
// selector returned a fresh empty array for a document with no annotations,
// so useSyncExternalStore never saw a stable snapshot.
//
// The tests render the real route tree at the workspace URL with the Tauri
// bridge mocked. The first test is the defect. The second test shows that two
// tabs of the same file are not part of the cause.
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import "@/i18n";
import { routeTree } from "@/routeTree.gen";
import { useAnnotations } from "@/stores/annotationsStore";
import { useDocuments } from "@/stores/documentStore";
import { useWorkspace } from "@/stores/workspaceStore";

const SEPARATOR = String.fromCharCode(92);
const DOC_PATH = ["A:", "scans", "hodiny.pdf"].join(SEPARATOR);

vi.mock("@/tauri/bridge", async () => (await import("@/test/fakeTauriBridge")).fakeBridge);

const commandFakes = vi.hoisted(() => ({
  openDocument: vi.fn(),
  detectScannedPdf: vi.fn(),
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

// The real hook needs the pdf.js worker, which jsdom has no use for. The stub
// keeps the page count of hodiny.pdf (1 page).
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

import { resetFakeBridge } from "@/test/fakeTauriBridge";

function renderWorkspace() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: ["/workspace/" + encodeURIComponent(DOC_PATH)],
    }),
  });
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router as never} />
    </QueryClientProvider>,
  );
}

async function renderAndCollectErrors() {
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    renderWorkspace();
    await screen.findAllByText(/hodiny\.pdf/);
    const messages = consoleError.mock.calls.map((call) =>
      call.map(String).join(" "),
    );
    return messages.some((message) =>
      message.includes("Maximum update depth exceeded"),
    );
  } finally {
    consoleError.mockRestore();
  }
}

describe("workspace route for a scanned PDF", () => {
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
      // Minimal test polyfill: Radix measures thumbs with ResizeObserver.
      window.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      };
    }
  });

  beforeEach(() => {
    vi.clearAllMocks();
    resetFakeBridge();
    commandFakes.openDocument.mockResolvedValue({
      status: "ok",
      data: { path: DOC_PATH, page_count: 1 },
    });
    commandFakes.detectScannedPdf.mockResolvedValue({
      status: "ok",
      data: { is_likely_scanned: true, average_text_length: 0 },
    });
    useDocuments.setState({ documents: new Map(), activeDocId: null });
    useAnnotations.setState({ byDoc: {}, mode: "highlight" });
    useWorkspace.setState({
      activeTool: "edit",
      editSubTool: "annotations",
      activePage: 0,
      zoom: 1,
    });
    localStorage.setItem("onboarded", "1");
  });

  it("keeps a stable snapshot in the annotations panel for a document with no annotations", async () => {
    const looped = await renderAndCollectErrors();
    expect(looped).toBe(false);
    expect(commandFakes.openDocument).toHaveBeenCalledWith(DOC_PATH);
  });

  it("stays stable with the default Forms sub-tool, the panel a fresh session opens with", async () => {
    useWorkspace.setState({ editSubTool: "forms" });
    const looped = await renderAndCollectErrors();
    expect(looped).toBe(false);
    expect(screen.getByText(/hodiny\.pdf/)).toBeInTheDocument();
  });

  it("stays stable with two tabs of the same file", async () => {
    const forwardSlashPath = DOC_PATH.split(SEPARATOR).join("/");
    useDocuments.getState().add({ id: DOC_PATH, path: DOC_PATH, pageCount: 1, dirty: false });
    useDocuments
      .getState()
      .add({ id: forwardSlashPath, path: forwardSlashPath, pageCount: 1, dirty: false });

    const looped = await renderAndCollectErrors();
    expect(looped).toBe(false);
    expect(useDocuments.getState().documents.size).toBe(2);
  });
});
