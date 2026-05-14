import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import {
  createMemoryHistory,
  createRouter,
  createRootRoute,
  createRoute,
  RouterProvider,
} from "@tanstack/react-router";
import "@/i18n";
import { Combine } from "lucide-react";
import { ToolTile } from "../ToolTile";
import type { ToolDef } from "@/config/tools";

function renderWithRouter(node: React.ReactNode) {
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
  return render(<RouterProvider router={router} />);
}

const tool: ToolDef = {
  id: "merge",
  i18nKey: "merge",
  route: "/tools/merge",
  icon: Combine,
  category: "tool",
};

describe("ToolTile", () => {
  it("renders a link to the tool route", async () => {
    renderWithRouter(<ToolTile tool={tool} />);
    const link = await waitFor(() => screen.getByRole("link"));
    expect(link.getAttribute("href")).toBe("/tools/merge");
  });

  it("applies a per-tool class hook for the onboarding tour selector", async () => {
    renderWithRouter(<ToolTile tool={tool} />);
    const link = await waitFor(() => screen.getByRole("link"));
    expect(link.className).toContain("tool-tile-merge");
  });

  it("renders the translated tool label", async () => {
    renderWithRouter(<ToolTile tool={tool} />);
    const link = await waitFor(() => screen.getByRole("link"));
    expect(link.textContent?.length ?? 0).toBeGreaterThan(0);
  });

  it("renders an svg icon inside the tile", async () => {
    const { container } = renderWithRouter(<ToolTile tool={tool} />);
    await waitFor(() => {
      expect(container.querySelector("svg")).not.toBeNull();
    });
  });
});
