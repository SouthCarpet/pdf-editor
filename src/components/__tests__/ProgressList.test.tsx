import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
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

  it("renders a populated store without an unstable snapshot update loop", async () => {
    useJobsStore.getState().start("j1", "merge", ["a.pdf"]);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      renderWithProviders(<ProgressList />);

      expect(await screen.findByText("merge")).toBeInTheDocument();
      act(() => {
        useJobsStore.getState().update("j1", {
          status: "running",
          progress: 0.5,
        });
      });

      expect(await screen.findByRole("progressbar", { name: "merge progress" })).toHaveAttribute(
        "aria-valuenow",
        "50",
      );
      expect(
        consoleError.mock.calls.some((call) =>
          call.some((argument) =>
            String(argument).includes("Maximum update depth exceeded"),
          ),
        ),
      ).toBe(false);
    } finally {
      consoleError.mockRestore();
    }
  });
});
