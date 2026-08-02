// Phase 17 Task 84 + Phase 18 Task 90h - WCAG 2.1 AA pass.
//
// Renders each route's primary component in jsdom under a minimal
// provider stack (TanStack Router memory history + QueryClient + i18n)
// and asserts axe-core finds zero violations of the configured rules.
//
// Mocks @tauri-apps/api/core so stores that call `invoke` on mount don't
// reject (they would otherwise blow up the render and leave the body
// empty, which axe would still pass but tests should still cover the
// real DOM).
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render } from "@testing-library/react";
import { axe } from "vitest-axe";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRouter,
  createRootRoute,
  createRoute,
  RouterProvider,
} from "@tanstack/react-router";

import "@/i18n";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string) => {
    // Return shape-safe defaults so stores don't throw.
    if (cmd === "recent_files_list") return [];
    if (cmd === "session_list") return [];
    if (cmd.startsWith("project_list")) return [];
    if (cmd.startsWith("pipeline_preset_list")) return [];
    if (cmd === "list_fonts_cmd") return [];
    if (cmd === "list_ocr_languages") return [];
    return null;
  }),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(async () => null),
  save: vi.fn(async () => null),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock("@/bindings", () => {
  const stub = vi.fn(async () => ({ status: "ok", data: null }));
  const handler: ProxyHandler<Record<string, unknown>> = {
    get: () => stub,
  };
  return {
    commands: new Proxy({}, handler),
    events: new Proxy({}, handler),
  };
});

beforeAll(() => {
  // Some Radix primitives query matchMedia for prefers-reduced-motion etc.
  if (typeof window.matchMedia !== "function") {
    Object.defineProperty(window, "matchMedia", {
      value: (q: string) => ({
        matches: false,
        media: q,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  }
});

function renderWithProviders(node: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const rootRoute = createRootRoute({ component: () => <>{node}</> });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

// Helper to keep each `it` body small + consistent. Each route's primary
// component is imported lazily so the failure surface (when a route
// regresses) is localized to its own test.
async function expectNoViolations(loader: () => Promise<React.ReactElement>) {
  const node = await loader();
  const { container } = renderWithProviders(node);
  // Let async store-loads inside the component settle before axe runs.
  await new Promise((r) => setTimeout(r, 0));
  const results = await axe(container);
  expect(results.violations).toEqual([]);
}

describe("a11y", () => {
  // --- existing layout shells --------------------------------------------
  it("Dashboard has no axe violations", async () => {
    await expectNoViolations(async () => {
      const { Dashboard } = await import("@/components/Dashboard");
      return <Dashboard />;
    });
  });

  it("TopBar has no axe violations", async () => {
    await expectNoViolations(async () => {
      const { TopBar } = await import("@/components/TopBar");
      return <TopBar />;
    });
  });

  it("FileDropzone has no axe violations", async () => {
    await expectNoViolations(async () => {
      const { FileDropzone } = await import("@/components/FileDropzone");
      return <FileDropzone onFiles={() => {}} />;
    });
  });

  it("ProgressList has no axe violations", async () => {
    await expectNoViolations(async () => {
      const { ProgressList } = await import("@/components/ProgressList");
      return <ProgressList />;
    });
  });

  it("GeneralSettings has no axe violations", async () => {
    await expectNoViolations(async () => {
      const { GeneralSettings } = await import(
        "@/components/settings/GeneralSettings"
      );
      return <GeneralSettings />;
    });
  });

  // --- Phase 18 Task 90h: per-route coverage -----------------------------
  it("MergeTool route has no axe violations", async () => {
    await expectNoViolations(async () => {
      const { MergeTool } = await import("@/components/tools/MergeTool");
      return <MergeTool />;
    });
  });

  it("SplitTool route has no axe violations", async () => {
    await expectNoViolations(async () => {
      const { SplitTool } = await import("@/components/tools/SplitTool");
      return <SplitTool />;
    });
  });

  it("ExtractTool route has no axe violations", async () => {
    await expectNoViolations(async () => {
      const { ExtractTool } = await import("@/components/tools/ExtractTool");
      return <ExtractTool />;
    });
  });

  it("CompressTool route has no axe violations", async () => {
    await expectNoViolations(async () => {
      const { CompressTool } = await import("@/components/tools/CompressTool");
      return <CompressTool />;
    });
  });

  it("OptimizeTool route has no axe violations", async () => {
    await expectNoViolations(async () => {
      const { OptimizeTool } = await import("@/components/tools/OptimizeTool");
      return <OptimizeTool />;
    });
  });

  it("UnlockTool route has no axe violations", async () => {
    await expectNoViolations(async () => {
      const { UnlockTool } = await import("@/components/tools/UnlockTool");
      return <UnlockTool />;
    });
  });

  it("ConvertExportTool route has no axe violations", async () => {
    await expectNoViolations(async () => {
      const { ConvertExportTool } = await import(
        "@/components/tools/ConvertExportTool"
      );
      return <ConvertExportTool />;
    });
  });

  it("ConvertImportTool route has no axe violations", async () => {
    await expectNoViolations(async () => {
      const { ConvertImportTool } = await import(
        "@/components/tools/ConvertImportTool"
      );
      return <ConvertImportTool />;
    });
  });

  it("ProjectList route has no axe violations", async () => {
    await expectNoViolations(async () => {
      const { ProjectList } = await import("@/components/projects/ProjectList");
      return <ProjectList />;
    });
  });
});
