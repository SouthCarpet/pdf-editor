// Plan 062 T1.3: the active workspace document enters the existing compare
// route as the left side, then the user chooses the right side from disk or
// from another open tab. The expected labels and state come from the binding
// brief's R1-R4 contract.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import i18n from "@/i18n";
import { routeTree } from "@/routeTree.gen";
import { useAnnotations } from "@/stores/annotationsStore";
import { useDocuments } from "@/stores/documentStore";
import { useWorkspace } from "@/stores/workspaceStore";

const DOC_A = "A:\\docs\\a.pdf";
const DOC_B = "A:\\docs\\b.pdf";

vi.mock("@/tauri/bridge", async () => (await import("@/test/fakeTauriBridge")).fakeBridge);

const commandFakes = vi.hoisted(() => ({
  openDocument: vi.fn(),
  detectScannedPdf: vi.fn(),
  sessionSave: vi.fn(),
  compareVisualCmd: vi.fn(),
  compareTextCmd: vi.fn(),
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

vi.mock("@/hooks/usePdfDocument", () => ({
  usePdfDocument: (path: string | null) =>
    path
      ? {
          pdf: {
            path,
            numPages: 1,
            getPage: async () => ({
              getViewport: () => ({ width: 600, height: 850 }),
            }),
          },
          numPages: 1,
        }
      : null,
}));

vi.mock("@/components/workspace/PdfViewer", () => ({
  PdfViewer: () => <div data-testid="pdf-page" />,
}));

import { fakeBridge, resetFakeBridge } from "@/test/fakeTauriBridge";

function addDocument(path: string) {
  useDocuments.getState().add({ id: path, path, pageCount: 1, dirty: false });
}

function renderWorkspace(initialEntry: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  });
  const view = render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router as never} />
    </QueryClientProvider>,
  );
  return { ...view, router };
}

describe("workspace compare flow", () => {
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
    commandFakes.openDocument.mockResolvedValue({
      status: "ok",
      data: { path: DOC_A, page_count: 1 },
    });
    commandFakes.detectScannedPdf.mockResolvedValue({
      status: "ok",
      data: { is_likely_scanned: false, average_text_length: 100 },
    });
    commandFakes.sessionSave.mockResolvedValue({ status: "ok", data: null });
    commandFakes.compareVisualCmd.mockResolvedValue({ status: "ok", data: { pages: [] } });
    commandFakes.compareTextCmd.mockResolvedValue({ status: "ok", data: { changes: [] } });
    useDocuments.setState({ documents: new Map(), activeDocId: null });
    useAnnotations.setState({ byDoc: {}, mode: "highlight" });
    useWorkspace.setState({ activeTool: "edit", activePage: 0, zoomByDoc: {} });
    localStorage.setItem("onboarded", "1");
  });

  it("opens compare from the toolbar with the active document on the left", async () => {
    const user = userEvent.setup();
    const { router } = renderWorkspace(`/workspace/${encodeURIComponent(DOC_A)}`);

    await user.click(await screen.findByRole("button", { name: "Porovnať" }));

    const panel = await screen.findByRole("region", { name: "Porovnanie dokumentov" });
    expect(within(panel).getByText("a.pdf")).toBeInTheDocument();
    expect(within(panel).getByText("Vyberte druhý dokument na porovnanie")).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.search.tool).toBe("compare"));
  });

  it("sets the right document when the user chooses a file", async () => {
    addDocument(DOC_A);
    fakeBridge.pickPaths.mockResolvedValue([DOC_B]);
    const user = userEvent.setup();
    renderWorkspace(`/workspace/${encodeURIComponent(DOC_A)}?tool=compare`);

    const panel = await screen.findByRole("region", { name: "Porovnanie dokumentov" });
    await user.click(within(panel).getByRole("button", { name: "Vybrať súbor" }));

    expect(fakeBridge.pickPaths).toHaveBeenCalledWith({
      multiple: false,
      directory: false,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    const viewer = await screen.findByRole("region", { name: "Dokumenty vedľa seba" });
    expect(within(viewer).getByText("a.pdf")).toBeInTheDocument();
    expect(within(viewer).getByText("b.pdf")).toBeInTheDocument();
  });

  it("sets the right document when the user chooses another open tab", async () => {
    addDocument(DOC_B);
    addDocument(DOC_A);
    const user = userEvent.setup();
    renderWorkspace(`/workspace/${encodeURIComponent(DOC_A)}?tool=compare`);

    const panel = await screen.findByRole("region", { name: "Porovnanie dokumentov" });
    await user.click(within(panel).getByRole("button", { name: "Vybrať otvorenú kartu" }));
    await user.click(within(panel).getByRole("button", { name: "b.pdf" }));

    const viewer = await screen.findByRole("region", { name: "Dokumenty vedľa seba" });
    expect(within(viewer).getByText("a.pdf")).toBeInTheDocument();
    expect(within(viewer).getByText("b.pdf")).toBeInTheDocument();
  });

  it("shows the second-document empty state with file and open-tab actions", async () => {
    addDocument(DOC_B);
    addDocument(DOC_A);
    renderWorkspace(`/workspace/${encodeURIComponent(DOC_A)}?tool=compare`);

    const panel = await screen.findByRole("region", { name: "Porovnanie dokumentov" });
    expect(within(panel).getByText("Vyberte druhý dokument na porovnanie")).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Vybrať súbor" })).toBeEnabled();
    expect(within(panel).getByRole("button", { name: "Vybrať otvorenú kartu" })).toBeEnabled();
  });
});
