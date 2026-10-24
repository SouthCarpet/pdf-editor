import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { ThemeProvider } from "../ThemeProvider";
import { TopBar } from "../TopBar";
import { useUpdateStore } from "@/stores/updateStore";
import i18n from "@/i18n";

const PATHS = ["/", "/projects", "/pipeline", "/settings", "/tools/merge", "/workspace/doc"];

async function renderAt(path: string) {
  const rootRoute = createRootRoute({
    component: () => (
      <ThemeProvider>
        <TopBar />
      </ThemeProvider>
    ),
  });
  const routes = PATHS.map((p) =>
    createRoute({ getParentRoute: () => rootRoute, path: p, component: () => null }),
  );
  const router = createRouter({
    routeTree: rootRoute.addChildren(routes),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  render(<RouterProvider router={router} />);
  return within(await screen.findByRole("navigation", { name: "Sections of PDF Editor" }));
}

beforeEach(async () => {
  localStorage.clear();
  await i18n.changeLanguage("en");
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  useUpdateStore.setState({ updateFlag: false });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TopBar", () => {
  it("shows the four sections in order, Settings last", async () => {
    const nav = await renderAt("/");
    expect(nav.getAllByRole("link").map((link) => link.textContent)).toEqual([
      "Tools",
      "Projects",
      "Pipeline",
      "Settings",
    ]);
  });

  it.each([
    ["/", "Tools"],
    ["/tools/merge", "Tools"],
    ["/projects", "Projects"],
    ["/pipeline", "Pipeline"],
    ["/settings", "Settings"],
  ])("marks the section of %s as current", async (path, label) => {
    const nav = await renderAt(path);
    const current = nav.getAllByRole("link").filter((l) => l.getAttribute("aria-current") === "page");
    expect(current.map((link) => link.textContent)).toEqual([label]);
  });

  it("marks no section on a document page", async () => {
    const nav = await renderAt("/workspace/doc");
    const current = nav.getAllByRole("link").filter((l) => l.getAttribute("aria-current") === "page");
    expect(current).toEqual([]);
  });

  it("carries the onboarding hook on the Settings tab only", async () => {
    const nav = await renderAt("/");
    const hooked = nav
      .getAllByRole("link")
      .filter((link) => link.getAttribute("data-onboard") === "settings");
    expect(hooked.map((link) => link.textContent)).toEqual(["Settings"]);
  });

  it("shows the quiet update line only when an update was found", async () => {
    await renderAt("/");
    expect(screen.queryByText("Update available")).toBeNull();

    useUpdateStore.setState({ updateFlag: true });
    const line = await screen.findByText("Update available");
    expect(line.closest("a")).toHaveAttribute("href", "/settings");
    expect(screen.queryByTestId("update-dot")).toBeNull();
  });

  it("switches the language with the EN / SK button", async () => {
    await renderAt("/");
    await userEvent.click(screen.getByRole("button", { name: "Language" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Jazyk" })).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Jazyk" }));
  });
});
