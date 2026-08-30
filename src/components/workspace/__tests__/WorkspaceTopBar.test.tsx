// Plan 060 task T1 (R2/R3/R4): the global Save / Save as / Convert row and
// the zoom indicator. The Tauri layer is mocked the same way
// `WorkspaceRoute.updateDepth.test.tsx` does it; navigation uses the
// minimal-router harness from `ToolTile.test.tsx` since these buttons only
// need a valid `href`, not a real destination screen.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import i18n from "@/i18n";
import type { Annotation } from "@/bindings";
import { useAnnotations } from "@/stores/annotationsStore";
import { useDocuments } from "@/stores/documentStore";
import { useWorkspace, ZOOM_DEFAULT } from "@/stores/workspaceStore";
import { historyStore } from "@/stores/historyStore";
import { WorkspaceTopBar } from "../WorkspaceTopBar";
import { Toaster } from "@/components/ui/toaster";

const DOC_A = "A:\\docs\\a.pdf";
const OUTPUT_PATH = "A:\\docs\\a.annotated.pdf";

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

const commandFakes = vi.hoisted(() => ({
  applyAnnotationsCmd: vi.fn(),
  autosaveDelete: vi.fn(),
}));
vi.mock("@/bindings", () => ({ commands: commandFakes }));

import { fakeBridge, resetFakeBridge } from "@/test/fakeTauriBridge";

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
  return render(<><RouterProvider router={router} /><Toaster /></>);
}

describe("WorkspaceTopBar", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("sk");
    vi.clearAllMocks();
    resetFakeBridge();
    commandFakes.applyAnnotationsCmd.mockReset();
    commandFakes.applyAnnotationsCmd.mockResolvedValue({ status: "ok", data: null });
    commandFakes.autosaveDelete.mockReset();
    commandFakes.autosaveDelete.mockResolvedValue({ status: "ok", data: null });
    useAnnotations.setState({ byDoc: {}, mode: "highlight" });
    useDocuments.setState({ documents: new Map(), activeDocId: null });
    useDocuments.getState().add({ id: DOC_A, path: DOC_A, pageCount: 1, dirty: false });
    useWorkspace.setState({ activeTool: "edit", zoomByDoc: {}, zoomModeByDoc: {} });
    historyStore.setState({ byDoc: {} });
  });

  it("renders the workspace tool row and the zoom indicator at 100% by default", async () => {
    renderWithRouter(<WorkspaceTopBar path={DOC_A} />);
    expect(await screen.findByRole("button", { name: "Upraviť" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zoradiť" })).toBeInTheDocument();
    expect(screen.getByText(`${ZOOM_DEFAULT * 100}%`)).toBeInTheDocument();
  });

  it("disables Save and Save as when the document has nothing pending", async () => {
    renderWithRouter(<WorkspaceTopBar path={DOC_A} />);
    expect(await screen.findByRole("button", { name: "Uložiť" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Uložiť ako" })).toBeDisabled();
  });

  it("disables history buttons when empty and enables redo after undo", async () => {
    const user = userEvent.setup();
    renderWithRouter(<WorkspaceTopBar path={DOC_A} />);
    expect(await screen.findByRole("button", { name: "Späť" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Znova" })).toBeDisabled();

    useAnnotations.getState().add(DOC_A, NOTE);
    const undo = await screen.findByRole("button", { name: "Späť" });
    expect(undo).toBeEnabled();
    expect(undo).toHaveAttribute("title", "Späť: pridanie");

    await user.click(undo);
    expect(await screen.findByRole("button", { name: "Znova" })).toBeEnabled();
  });

  it("Uložiť saves pending work through the shared save flow and clears it", async () => {
    useAnnotations.getState().add(DOC_A, NOTE);
    fakeBridge.pickSavePath.mockResolvedValue(OUTPUT_PATH);
    const user = userEvent.setup();
    renderWithRouter(<WorkspaceTopBar path={DOC_A} />);

    const saveButton = await screen.findByRole("button", { name: "Uložiť" });
    expect(saveButton).toBeEnabled();
    await user.click(saveButton);

    await waitFor(() => expect(commandFakes.applyAnnotationsCmd).toHaveBeenCalledTimes(1));
    expect(commandFakes.applyAnnotationsCmd).toHaveBeenCalledWith(
      expect.objectContaining({ input: DOC_A, output: OUTPUT_PATH }),
    );
    await waitFor(() => expect(useAnnotations.getState().byDoc[DOC_A]).toHaveLength(0));
  });

  it("Uložiť ako always opens the path dialog", async () => {
    useAnnotations.getState().add(DOC_A, NOTE);
    fakeBridge.pickSavePath.mockResolvedValue(OUTPUT_PATH);
    const user = userEvent.setup();
    renderWithRouter(<WorkspaceTopBar path={DOC_A} />);

    await user.click(await screen.findByRole("button", { name: "Uložiť ako" }));

    await waitFor(() => expect(fakeBridge.pickSavePath).toHaveBeenCalledTimes(1));
  });

  it("the successful-save toast reveals the saved path in Explorer", async () => {
    useAnnotations.getState().add(DOC_A, NOTE);
    fakeBridge.pickSavePath.mockResolvedValue(OUTPUT_PATH);
    const user = userEvent.setup();
    renderWithRouter(<WorkspaceTopBar path={DOC_A} />);

    await user.click(await screen.findByRole("button", { name: "Uložiť" }));
    const [revealAction] = await screen.findAllByRole("button", { name: "Zobraziť v Prieskumníku" });
    fireEvent.click(revealAction);

    expect(fakeBridge.revealSavedFile).toHaveBeenCalledWith(OUTPUT_PATH);
  });

  it("the zoom buttons step the displayed percentage up and down", async () => {
    const user = userEvent.setup();
    renderWithRouter(<WorkspaceTopBar path={DOC_A} />);

    await user.click(await screen.findByRole("button", { name: "Priblížiť" }));
    expect(await screen.findByText("110%")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Oddialiť" }));
    await user.click(screen.getByRole("button", { name: "Oddialiť" }));
    expect(await screen.findByText("90%")).toBeInTheDocument();
  });

  it("clicking the zoom percentage resets it to 100%", async () => {
    useWorkspace.getState().setZoom(DOC_A, 2.5);
    const user = userEvent.setup();
    renderWithRouter(<WorkspaceTopBar path={DOC_A} />);

    await user.click(await screen.findByText("250%"));

    expect(await screen.findByText("100%")).toBeInTheDocument();
  });

  // Oracle: T3.1 R1 defines a one-based editable page box with a text total.
  it("submits the editable page number on Enter", async () => {
    const onSelectPage = vi.fn();
    const user = userEvent.setup();
    renderWithRouter(
      <WorkspaceTopBar
        path={DOC_A}
        pageCount={12}
        activePage={2}
        onSelectPage={onSelectPage}
      />,
    );
    const input = await screen.findByRole("textbox", { name: "Číslo strany" });
    expect(input).toHaveValue("3");
    expect(screen.getByText("12")).toBeInTheDocument();
    await user.clear(input);
    await user.type(input, "8{Enter}");
    expect(onSelectPage).toHaveBeenCalledWith(7);
  });

  it("selects fit-width from the zoom mode menu", async () => {
    const user = userEvent.setup();
    renderWithRouter(<WorkspaceTopBar path={DOC_A} />);
    await user.click(await screen.findByRole("button", { name: "Režim mierky" }));
    await user.click(screen.getByRole("menuitem", { name: "Na šírku" }));
    expect(useWorkspace.getState().getZoomMode(DOC_A)).toBe("fit-width");
  });

  it("links Konvertovať to the Convert tool with the active document", async () => {
    renderWithRouter(<WorkspaceTopBar path={DOC_A} />);
    const link = await screen.findByRole("link", { name: "Konvertovať" });
    expect(link.getAttribute("href")).toContain("/tools/convert/export");
    expect(decodeURIComponent(link.getAttribute("href") ?? "")).toContain(DOC_A);
  });

  it("the overflow menu lists the other document-level tools", async () => {
    const user = userEvent.setup();
    renderWithRouter(<WorkspaceTopBar path={DOC_A} />);

    await user.click(await screen.findByRole("button", { name: /Ďalšie nástroje/ }));

    expect(await screen.findByRole("menuitem", { name: "Skomprimovať" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Zlúčiť" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Rozdeliť" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Optimalizovať" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Odomknúť" })).toBeInTheDocument();
  });
});
