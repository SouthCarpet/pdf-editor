// Plan 060 task T1 (R1/R2): the DOM wiring around `resolveShortcut` -
// registered once, dispatches into the zoom store and the shared save
// flow, and honours the "ignored in a text input, except Ctrl+S" rule end
// to end (`shortcuts.test.ts` covers the pure resolution logic in full).
//
// `fireEvent.keyDown` (not `userEvent.keyboard`'s DSL) so `ctrlKey`/`key`
// are set exactly, and so the event's `target` can be pinned to a specific
// element - the DSL cannot express "this key, with this modifier, as if it
// came from that input" as directly.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";
import type { Annotation } from "@/bindings";
import { useAnnotations } from "@/stores/annotationsStore";
import { useDocuments } from "@/stores/documentStore";
import { useWorkspace, ZOOM_DEFAULT, ZOOM_STEP } from "@/stores/workspaceStore";
import { useWorkspaceShortcuts } from "../useWorkspaceShortcuts";

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
}));
vi.mock("@/bindings", () => ({ commands: commandFakes }));

import { fakeBridge, resetFakeBridge } from "@/test/fakeTauriBridge";

// A plain `data-testid`, not `aria-label`/`placeholder`: those are
// user-facing attributes the i18n literal-string gate polices, and this
// element exists only to give a keydown a text-input `target` in the test.
function Harness({
  docId,
  onDeletePending,
}: {
  docId: string;
  onDeletePending?: () => void;
}) {
  useWorkspaceShortcuts(docId, { onDeletePending });
  return <input data-testid="draft" />;
}

describe("useWorkspaceShortcuts", () => {
  beforeEach(() => {
    resetFakeBridge();
    commandFakes.applyAnnotationsCmd.mockReset();
    commandFakes.applyAnnotationsCmd.mockResolvedValue({ status: "ok", data: null });
    useAnnotations.setState({ byDoc: {}, mode: "highlight" });
    useDocuments.setState({ documents: new Map(), activeDocId: null });
    useDocuments.getState().add({ id: DOC_A, path: DOC_A, pageCount: 1, dirty: false });
    useWorkspace.setState({ zoomByDoc: {} });
  });

  it("Ctrl+Plus zooms in", () => {
    const { baseElement } = render(<Harness docId={DOC_A} />);
    fireEvent.keyDown(baseElement, { key: "+", ctrlKey: true });
    expect(useWorkspace.getState().getZoom(DOC_A)).toBeCloseTo(ZOOM_DEFAULT + ZOOM_STEP, 5);
  });

  it("Ctrl+0 resets the zoom", () => {
    useWorkspace.getState().setZoom(DOC_A, 3);
    const { baseElement } = render(<Harness docId={DOC_A} />);
    fireEvent.keyDown(baseElement, { key: "0", ctrlKey: true });
    expect(useWorkspace.getState().getZoom(DOC_A)).toBe(ZOOM_DEFAULT);
  });

  it("zoom shortcuts are ignored while a text input has focus", () => {
    const { getByTestId } = render(<Harness docId={DOC_A} />);
    fireEvent.keyDown(getByTestId("draft"), { key: "+", ctrlKey: true });
    expect(useWorkspace.getState().getZoom(DOC_A)).toBe(ZOOM_DEFAULT);
  });

  it("Ctrl+S saves even while a text input has focus", async () => {
    useAnnotations.getState().add(DOC_A, NOTE);
    fakeBridge.pickSavePath.mockResolvedValue(OUTPUT_PATH);
    const { getByTestId } = render(<Harness docId={DOC_A} />);

    fireEvent.keyDown(getByTestId("draft"), { key: "s", ctrlKey: true });

    await waitFor(() => expect(commandFakes.applyAnnotationsCmd).toHaveBeenCalledTimes(1));
  });

  it("Ctrl+S does nothing when there is nothing to save", () => {
    const { baseElement } = render(<Harness docId={DOC_A} />);
    fireEvent.keyDown(baseElement, { key: "s", ctrlKey: true });
    expect(fakeBridge.pickSavePath).not.toHaveBeenCalled();
    expect(commandFakes.applyAnnotationsCmd).not.toHaveBeenCalled();
  });

  // Plan 062 T1.1: the window listener must dispatch Delete / Backspace
  // into the workspace delete path when focus is not a text input.
  it("Delete calls onDeletePending when focus is not a text input", () => {
    const onDeletePending = vi.fn();
    const { baseElement } = render(
      <Harness docId={DOC_A} onDeletePending={onDeletePending} />,
    );
    fireEvent.keyDown(baseElement, { key: "Delete" });
    expect(onDeletePending).toHaveBeenCalledTimes(1);
  });

  it("Backspace calls onDeletePending when focus is not a text input", () => {
    const onDeletePending = vi.fn();
    const { baseElement } = render(
      <Harness docId={DOC_A} onDeletePending={onDeletePending} />,
    );
    fireEvent.keyDown(baseElement, { key: "Backspace" });
    expect(onDeletePending).toHaveBeenCalledTimes(1);
  });

  it("Delete and Backspace inside a text input do not call onDeletePending", () => {
    const onDeletePending = vi.fn();
    const { getByTestId } = render(
      <Harness docId={DOC_A} onDeletePending={onDeletePending} />,
    );
    fireEvent.keyDown(getByTestId("draft"), { key: "Delete" });
    fireEvent.keyDown(getByTestId("draft"), { key: "Backspace" });
    expect(onDeletePending).not.toHaveBeenCalled();
  });
});
