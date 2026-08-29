// Plan 050 task D2-UX-2 (R3): closing a tab with unsaved work asks first.
//
// Renders `DocumentTabs` alone under a minimal router (not the app's real
// route tree / `Layout`): the real tree drags in the workspace route's
// pdf.js dependency and the projects screen's live Tauri calls, neither of
// which this test needs - it only exercises tab close + the close guard.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import i18n from "@/i18n";
import "@/i18n";
import type { Annotation } from "@/bindings";
import { useAnnotations } from "@/stores/annotationsStore";
import { useDocuments } from "@/stores/documentStore";
import { useCloseGuard } from "@/stores/closeGuardStore";
import { DocumentTabs } from "../DocumentTabs";

const DOC_A = "A:\\docs\\a.pdf";
const DOC_B = "A:\\docs\\b.pdf";

const NOTE: Annotation = {
  type: "note",
  page: 0,
  x: 0,
  y: 0,
  contents: "hi",
  icon: "comment",
  color: [0, 0, 0],
};

vi.mock("@/tauri/bridge", async () => (await import("@/test/fakeTauriBridge")).fakeBridge);

const rootRoute = createRootRoute({ component: () => <DocumentTabs /> });
const projectsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/projects", component: () => null });
const workspaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/workspace/$docId",
  component: () => null,
});
const routeTree = rootRoute.addChildren([projectsRoute, workspaceRoute]);

function renderTabs(initialPath = "/projects") {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
  return render(<RouterProvider router={router as never} />);
}

describe("DocumentTabs close guard", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("sk");
    useAnnotations.setState({ byDoc: {}, mode: "highlight" });
    useDocuments.setState({ documents: new Map(), activeDocId: null });
    useCloseGuard.setState({ request: null });
  });

  it("closes a clean tab immediately, without opening the guard", async () => {
    useDocuments.getState().add({ id: DOC_A, path: DOC_A, pageCount: 1, dirty: false });
    const user = userEvent.setup();
    renderTabs();

    await user.click(await screen.findByRole("button", { name: "Zavrieť a.pdf" }));

    expect(useCloseGuard.getState().request).toBeNull();
    expect(useDocuments.getState().documents.has(DOC_A)).toBe(false);
  });

  it("opens the guard, scoped to that document, for a tab with a pending annotation", async () => {
    useDocuments.getState().add({ id: DOC_A, path: DOC_A, pageCount: 1, dirty: false });
    useAnnotations.getState().add(DOC_A, NOTE);
    const user = userEvent.setup();
    renderTabs();

    await user.click(await screen.findByRole("button", { name: "Zavrieť a.pdf" }));

    const request = useCloseGuard.getState().request;
    expect(request).toEqual(expect.objectContaining({ kind: "tab", docId: DOC_A }));
    // The tab itself must still be open: the guard, not the click, decides.
    expect(useDocuments.getState().documents.has(DOC_A)).toBe(true);
  });

  it("removes only the requested tab once the guard's onClosed runs", async () => {
    useDocuments.getState().add({ id: DOC_A, path: DOC_A, pageCount: 1, dirty: false });
    useDocuments.getState().add({ id: DOC_B, path: DOC_B, pageCount: 1, dirty: false });
    useAnnotations.getState().add(DOC_A, NOTE);
    const user = userEvent.setup();
    renderTabs();

    await user.click(await screen.findByRole("button", { name: "Zavrieť a.pdf" }));

    const request = useCloseGuard.getState().request;
    expect(request?.kind).toBe("tab");
    if (request?.kind === "tab") request.onClosed();

    expect(useDocuments.getState().documents.has(DOC_A)).toBe(false);
    expect(useDocuments.getState().documents.has(DOC_B)).toBe(true);
  });

  it("shows the unsaved-changes dot for a document with a pending annotation", async () => {
    useDocuments.getState().add({ id: DOC_A, path: DOC_A, pageCount: 1, dirty: false });
    useAnnotations.getState().add(DOC_A, NOTE);
    renderTabs();

    expect(await screen.findByLabelText("Neuložené zmeny")).toBeInTheDocument();
  });

  it("does not show the dot for a clean document", async () => {
    useDocuments.getState().add({ id: DOC_A, path: DOC_A, pageCount: 1, dirty: false });
    renderTabs();

    await screen.findByRole("button", { name: "Zavrieť a.pdf" });
    expect(screen.queryByLabelText("Neuložené zmeny")).toBeNull();
  });
});
