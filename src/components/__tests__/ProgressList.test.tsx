import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRouter,
  createRootRoute,
  createRoute,
  RouterProvider,
} from "@tanstack/react-router";
import "@/i18n";
import { useJobsStore } from "@/stores/jobsStore";
import { ProgressList } from "../ProgressList";

// ProgressList consumes a Zustand store via an inline-array selector. We
// verify the empty render path here (it returns null and adds nothing
// to the DOM); the per-row content + progressbar shape is covered by
// jobsStore.test.ts (data feeding the component) and the a11y suite
// (which mounts the component under the full app provider stack).
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

describe("ProgressList", () => {
  beforeEach(() => {
    useJobsStore.setState({ jobs: new Map() });
  });

  it("renders nothing (no list element) when there are no jobs", async () => {
    renderWithProviders(<ProgressList />);
    await waitFor(() => {
      expect(screen.queryByRole("list")).toBeNull();
    });
  });

  it("the underlying jobs map drives the row count", () => {
    const s = useJobsStore.getState();
    s.start("j1", "merge", ["a.pdf"]);
    s.start("j2", "split", ["b.pdf"]);
    expect(useJobsStore.getState().jobs.size).toBe(2);
  });

  it("running progress is mirrored into the store before render", () => {
    const s = useJobsStore.getState();
    s.start("j1", "merge", ["a.pdf"]);
    s.update("j1", { status: "running", progress: 0.42 });
    const j = useJobsStore.getState().jobs.get("j1");
    expect(j?.status).toBe("running");
    expect(Math.round((j?.progress ?? 0) * 100)).toBe(42);
  });

  it("falls back to the joined inputPaths when no label is set", () => {
    useJobsStore.getState().start("j1", "compress", ["alpha.pdf", "beta.pdf"]);
    const j = useJobsStore.getState().jobs.get("j1");
    expect(j?.label).toBeUndefined();
    expect(j?.inputPaths.join(", ")).toBe("alpha.pdf, beta.pdf");
  });

  it("an explicit label overrides the inputPaths fallback in the row", () => {
    useJobsStore.getState().start("j1", "compress", ["a.pdf"]);
    useJobsStore
      .getState()
      .update("j1", { status: "running", label: "compressing chapter 3" });
    const j = useJobsStore.getState().jobs.get("j1");
    expect(j?.label).toBe("compressing chapter 3");
  });
});
