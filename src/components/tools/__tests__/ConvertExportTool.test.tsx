// Plan 061 T1 fix wave (F1): `ConvertExportTool` used `useSearch({ from:
// "/tools/convert/export" })`, which throws when the component is mounted
// outside that exact route - including in `src/test/a11y.spec.tsx`, whose
// minimal router does not register it, so that a11y check exercised the
// router's default error boundary, not the real component. The fix reads
// the search param with `strict: false`, so the component works standalone
// (tool tile, `?file` absent) and under its real route (`?file=` set by the
// workspace toolbar's Convert shortcut).
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import "@/i18n";
import { ConvertExportTool } from "../ConvertExportTool";

vi.mock("@/tauri/bridge", async () => (await import("@/test/fakeTauriBridge")).fakeBridge);

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

const FILE_PATH = "A:\\docs\\a.pdf";

function renderStandalone() {
  const rootRoute = createRootRoute({ component: () => <ConvertExportTool /> });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(<RouterProvider router={router} />);
}

function renderUnderRoute(initialPath: string) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const exportRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/tools/convert/export",
    component: ConvertExportTool,
    validateSearch: (search: Record<string, unknown>) => {
      const { file } = search;
      return typeof file === "string" ? { file } : {};
    },
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([exportRoute]),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
  return render(<RouterProvider router={router} />);
}

describe("ConvertExportTool", () => {
  it("renders the dropzone when mounted outside the /tools/convert/export route", async () => {
    renderStandalone();

    expect(await screen.findByTestId("dropzone-placeholder")).toBeInTheDocument();
  });

  it("pre-fills the file from the route search when opened under its own route", async () => {
    renderUnderRoute(`/tools/convert/export?file=${encodeURIComponent(FILE_PATH)}`);

    expect(await screen.findByText(FILE_PATH)).toBeInTheDocument();
  });
});
