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

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(async () => null),
  save: vi.fn(async () => null),
}));
vi.mock("@tauri-apps/plugin-fs", () => ({ readFile: vi.fn(async () => new Uint8Array()) }));
vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({ onDragDropEvent: async () => () => {} }),
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

vi.mock("@tauri-apps/api/core", () => ({
  Channel: class {},
  invoke: vi.fn(async (command: string) => {
    switch (command) {
      case "open_document":
        return { path: DOC_PATH, page_count: 1 };
      // hodiny.pdf is a Genius Scan JPEG-only PDF: no text layer.
      case "detect_scanned_pdf":
        return { is_likely_scanned: true, average_text_length: 0 };
      case "list_ocr_languages":
        return ["eng"];
      case "check_for_update":
        return {
          embedded_commit: "test",
          embedded_dirty: false,
          repo_head: null,
          dirty: false,
          behind: false,
          error: null,
        };
      // No AcroForm, no OCR backends, no session, no recent files.
      default:
        return [];
    }
  }),
}));

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
  renderWorkspace();
  await new Promise((resolve) => setTimeout(resolve, 300));
  const messages = consoleError.mock.calls.map((call) => call.map(String).join(" "));
  consoleError.mockRestore();
  return messages.some((message) => message.includes("Maximum update depth exceeded"));
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
    // Guard against a silently empty render passing the loop check.
    expect(screen.getByText(/hodiny\.pdf/)).toBeInTheDocument();
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
