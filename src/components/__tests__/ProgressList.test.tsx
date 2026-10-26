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

  it("names LibreOffice and its download page when Office conversion cannot run (plan 119)", async () => {
    const url = "https://www.libreoffice.org/download/download-libreoffice/";
    useJobsStore.getState().start("j1", "convert-import", ["a.docx"]);
    useJobsStore.getState().fail("j1", "libreoffice_missing", url);

    renderWithProviders(<ProgressList />);

    expect(
      await screen.findByText(
        `Office conversion needs LibreOffice, which is not installed. Download it from ${url} and try again.`,
      ),
    ).toBeInTheDocument();
  });
  it("marks a running job with a word and a determinate k-progress bar, not a spinner", async () => {
    useJobsStore.getState().start("j1", "merge", ["a.pdf"]);
    act(() => {
      useJobsStore.getState().update("j1", { status: "running", progress: 0.25 });
    });
    const { container } = renderWithProviders(<ProgressList />);

    expect(await screen.findByText("Running")).toBeInTheDocument();
    const bar = await screen.findByRole("progressbar", { name: "merge progress" });
    expect(bar).toHaveClass("k-progress");
    expect(bar.querySelector(".k-progress-fill")).toHaveStyle({ "--k-value": "0.25" });
    expect(container.querySelector(".animate-spin")).toBeNull();
  });

  it("names each finished state in words (done, failed, cancelled)", async () => {
    const jobs = useJobsStore.getState();
    jobs.start("d", "merge", ["a.pdf"]);
    jobs.finish("d", ["out.pdf"]);
    jobs.start("e", "split", ["b.pdf"]);
    jobs.fail("e", "internal");
    jobs.start("c", "extract", ["c.pdf"]);
    jobs.cancel("c");

    renderWithProviders(<ProgressList />);

    expect(await screen.findByText("Done")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
  });
});
