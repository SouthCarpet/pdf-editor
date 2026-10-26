// Plan 119 K1-fix2: pins how WorkspaceRoute shows a failed open. An AppError
// shows its translated key, any other throw shows its text, and both show
// the decoded path of the document.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import i18n from "@/i18n";
import { routeTree } from "@/routeTree.gen";
import { useDocuments } from "@/stores/documentStore";

const DOC_PATH = ["A:", "scans", "broken.pdf"].join(String.fromCharCode(92));

vi.mock("@/tauri/bridge", async () => (await import("@/test/fakeTauriBridge")).fakeBridge);

const commandFakes = vi.hoisted(() => ({
  openDocument: vi.fn(),
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
vi.mock("@/hooks/usePdfDocument", () => ({ usePdfDocument: () => null }));

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

describe("workspace route failed open", () => {
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
    await i18n.changeLanguage("en");
    vi.clearAllMocks();
    resetFakeBridge();
    useDocuments.setState({ documents: new Map(), activeDocId: null });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the key of an AppError, the path and a way back", async () => {
    commandFakes.openDocument.mockResolvedValue({
      status: "error",
      error: { key: "no.such.error.key", data: {} },
    });
    renderWorkspace();

    expect(
      await screen.findByText("Failed to open document: no.such.error.key"),
    ).toBeInTheDocument();
    expect(screen.getByText(DOC_PATH)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to projects" })).toBeInTheDocument();
  });

  it("shows the text of an error that is no AppError", async () => {
    commandFakes.openDocument.mockResolvedValue({ status: "error", error: "disk gone" });
    renderWorkspace();

    expect(await screen.findByText("Failed to open document: disk gone")).toBeInTheDocument();
  });
});
