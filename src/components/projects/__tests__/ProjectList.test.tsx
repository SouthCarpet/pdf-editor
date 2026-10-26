import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import {
  createMemoryHistory,
  createRouter,
  createRootRoute,
  createRoute,
  RouterProvider,
} from "@tanstack/react-router";
import i18n from "@/i18n";

vi.mock("@/tauri/bridge", async () => (await import("@/test/fakeTauriBridge")).fakeBridge);
vi.mock("@/components/opening/openFilesContext", () => ({
  useOpenFiles: () => ({ browseForPdfs: vi.fn() }),
}));

import { useProjectsStore } from "@/stores/projectsStore";
import { ProjectList } from "../ProjectList";

function project(id: number, name: string, description: string | null) {
  return { id, name, description, created_at: "2026-10-01T10:00:00Z", updated_at: "2026-10-02T10:00:00Z" };
}

function renderList() {
  const rootRoute = createRootRoute({ component: () => <ProjectList /> });
  const detail = createRoute({
    getParentRoute: () => rootRoute,
    path: "/projects/$id",
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([detail]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(<RouterProvider router={router} />);
}

describe("ProjectList (Kaliber ledger)", () => {
  beforeEach(async () => {
    useProjectsStore.setState({
      projects: [project(1, "Invoices", "Monthly scans"), project(2, "Contracts", null)] as never,
      loading: false,
      refresh: vi.fn().mockResolvedValue(undefined),
    });
    await i18n.changeLanguage("en");
  });

  it("shows the projects as a ruled table with the name as a row header link", async () => {
    renderList();
    const table = await screen.findByRole("table");
    expect(table.className).toContain("k-table");
    const link = within(table).getByRole("link", { name: "Invoices" });
    expect(link.closest("th")).toHaveAttribute("scope", "row");
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Name",
      "Description",
      "Updated",
    ]);
  });

  it("counts the projects in the locale plural form", async () => {
    renderList();
    expect(await screen.findByText("2 projects")).toBeInTheDocument();
    await i18n.changeLanguage("sk");
    useProjectsStore.setState({ projects: [project(1, "A", null)] as never });
    expect(await screen.findByText("1 projekt")).toBeInTheDocument();
    await i18n.changeLanguage("en");
  });

  it("uses no dashed card for opening PDFs", async () => {
    const { container } = renderList();
    await screen.findByRole("table");
    expect(container.querySelector(".border-dashed")).toBeNull();
  });
});
