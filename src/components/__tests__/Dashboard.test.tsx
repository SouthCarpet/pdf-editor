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

import { fakeBridge, resetFakeBridge } from "@/test/fakeTauriBridge";
import { useRecentFiles } from "@/stores/recentFilesStore";
import { TOOLS } from "@/config/tools";
import { Dashboard } from "../Dashboard";

function renderHome() {
  const rootRoute = createRootRoute({ component: () => <Dashboard /> });
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

describe("Dashboard (Kaliber home)", () => {
  beforeEach(async () => {
    resetFakeBridge();
    useRecentFiles.setState({ files: [], loading: false });
    fakeBridge.invokeCommand.mockResolvedValue([]);
    await i18n.changeLanguage("en");
  });

  it("makes the Tools heading the lead and demotes the app title", async () => {
    renderHome();
    const lead = await screen.findByRole("heading", { level: 2, name: "Tools" });
    expect(lead.className).toContain("text-2xl");
    const title = screen.getByRole("heading", { level: 1, name: "PDF Editor" });
    expect(title.className).toContain("k-label");
    expect(title.className).not.toContain("text-2xl");
  });

  it("lists every tool as a link row in one list, with no card wrapper", async () => {
    renderHome();
    const lead = await screen.findByRole("heading", { level: 2, name: "Tools" });
    const list = lead.parentElement!.querySelector("ul")!;
    const links = within(list).getAllByRole("link");
    expect(links).toHaveLength(TOOLS.filter((x) => x.category === "tool").length);
    for (const link of links) {
      expect(link.className).toContain("k-list-item");
      expect(link.className).not.toContain("border");
    }
  });

  it("opens a recent file from a row button", async () => {
    useRecentFiles.setState({
      files: [{ path: "C:/docs/a.pdf", display_name: "a.pdf", last_opened_at: "2026-10-24" }],
    });
    fakeBridge.invokeCommand.mockResolvedValue([
      { path: "C:/docs/a.pdf", display_name: "a.pdf", last_opened_at: "2026-10-24" },
    ]);
    renderHome();
    const row = await screen.findByRole("button", { name: "a.pdf" });
    expect(row.className).toContain("k-list-item");
  });
});
