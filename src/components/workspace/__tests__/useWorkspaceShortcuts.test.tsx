// Plan 060 task T1 (R1/R2): the DOM wiring around `resolveShortcut` -
// registered once, dispatches into the zoom store and the shared save
// flow, and honours the "ignored in a text input, except Ctrl+S" rule end
// to end (`shortcuts.test.ts` covers the pure resolution logic in full).
//
// `fireEvent.keyDown` (not `userEvent.keyboard`'s DSL) so `ctrlKey`/`key`
// are set exactly, and so the event's `target` can be pinned to a specific
// element - the DSL cannot express "this key, with this modifier, as if it
// came from that input" as directly.
import { useEffect } from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";
import type { Annotation } from "@/bindings";
import { useAnnotations } from "@/stores/annotationsStore";
import { useDocuments } from "@/stores/documentStore";
import { useWorkspace, ZOOM_DEFAULT, ZOOM_STEP } from "@/stores/workspaceStore";
import { historyStore } from "@/stores/historyStore";
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
  autosaveDelete: vi.fn(),
}));
vi.mock("@/bindings", () => ({ commands: commandFakes }));

import { fakeBridge, resetFakeBridge } from "@/test/fakeTauriBridge";

// A plain `data-testid`, not `aria-label`/`placeholder`: those are
// user-facing attributes the i18n literal-string gate polices, and this
// element exists only to give a keydown a text-input `target` in the test.
function Harness({
  docId,
  onDeletePending,
  onNextField,
  onPreviousField,
  onConfirmNextField,
  onPreviousPage,
  onPreviousSpread,
  onNextSpread,
  onToggleBookMode,
  onOpenSearch,
  onOpenShortcuts,
  searchOpen,
  onCloseSearch,
  onStripEscape,
}: {
  docId: string;
  onDeletePending?: () => void;
  onNextField?: () => void;
  onPreviousField?: () => void;
  onConfirmNextField?: () => void;
  onPreviousPage?: () => void;
  onPreviousSpread?: () => void;
  onNextSpread?: () => void;
  onToggleBookMode?: () => void;
  onOpenSearch?: () => void;
  onOpenShortcuts?: () => void;
  searchOpen?: boolean;
  onCloseSearch?: () => void;
  onStripEscape?: () => void;
}) {
  useWorkspaceShortcuts(docId, {
    onDeletePending,
    onNextField,
    onPreviousField,
    onConfirmNextField,
    onPreviousPage,
    onPreviousSpread,
    onNextSpread,
    onToggleBookMode,
    onOpenSearch,
    onOpenShortcuts,
    searchOpen,
    onCloseSearch,
  });
  useEffect(() => {
    if (!onStripEscape) return;
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onStripEscape?.();
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onStripEscape]);
  return (
    <div>
      <input data-testid="draft" />
      <input data-testid="search" data-workspace-search-input />
      <div data-pending-annotation-host>
        <div role="group">
          <input data-testid="strip-text" type="text" />
          <input data-testid="strip-color" type="color" />
        </div>
      </div>
    </div>
  );
}

describe("useWorkspaceShortcuts", () => {
  beforeEach(() => {
    resetFakeBridge();
    commandFakes.applyAnnotationsCmd.mockReset();
    commandFakes.applyAnnotationsCmd.mockResolvedValue({ status: "ok", data: [] });
    commandFakes.autosaveDelete.mockReset();
    commandFakes.autosaveDelete.mockResolvedValue({ status: "ok", data: null });
    useAnnotations.setState({ byDoc: {}, mode: "highlight" });
    useDocuments.setState({ documents: new Map(), activeDocId: null });
    useDocuments.getState().add({ id: DOC_A, path: DOC_A, pageCount: 1, dirty: false });
    useWorkspace.setState({ zoomByDoc: {} });
    historyStore.setState({ byDoc: {} });
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

  it("Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z dispatch document history", () => {
    let value = 1;
    historyStore.getState().push(DOC_A, {
      label: "text",
      undo: () => {
        value = 0;
      },
      redo: () => {
        value = 1;
      },
    });
    const { baseElement } = render(<Harness docId={DOC_A} />);

    fireEvent.keyDown(baseElement, { key: "z", ctrlKey: true });
    expect(value).toBe(0);
    fireEvent.keyDown(baseElement, { key: "y", ctrlKey: true });
    expect(value).toBe(1);
    fireEvent.keyDown(baseElement, { key: "z", ctrlKey: true });
    fireEvent.keyDown(baseElement, { key: "z", ctrlKey: true, shiftKey: true });
    expect(value).toBe(1);
  });

  it("Ctrl+Z in the strip text input keeps the browser native undo path", () => {
    const undo = vi.fn();
    historyStore.getState().push(DOC_A, { label: "text", undo, redo: vi.fn() });
    const { getByTestId } = render(<Harness docId={DOC_A} />);

    fireEvent.keyDown(getByTestId("strip-text"), { key: "z", ctrlKey: true });

    expect(undo).not.toHaveBeenCalled();
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

  it("Ctrl+P requests print for the active document from a text input", () => {
    const onPrintRequest = vi.fn();
    window.addEventListener("pdf-editor:workspace-print-request", onPrintRequest);
    const { getByTestId } = render(<Harness docId={DOC_A} />);

    fireEvent.keyDown(getByTestId("draft"), { key: "p", ctrlKey: true });

    expect(onPrintRequest).toHaveBeenCalledTimes(1);
    expect((onPrintRequest.mock.calls[0][0] as CustomEvent).detail).toEqual({ docId: DOC_A });
    window.removeEventListener("pdf-editor:workspace-print-request", onPrintRequest);
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

  it("Tab and Shift+Tab dispatch from the strip text input", () => {
    const onNextField = vi.fn();
    const onPreviousField = vi.fn();
    const { getByTestId } = render(
      <Harness
        docId={DOC_A}
        onNextField={onNextField}
        onPreviousField={onPreviousField}
      />,
    );

    fireEvent.keyDown(getByTestId("strip-text"), { key: "Tab" });
    fireEvent.keyDown(getByTestId("strip-text"), { key: "Tab", shiftKey: true });

    expect(onNextField).toHaveBeenCalledTimes(1);
    expect(onPreviousField).toHaveBeenCalledTimes(1);
  });

  it("Tab from another form control does not navigate", () => {
    const onNextField = vi.fn();
    const { getByTestId } = render(<Harness docId={DOC_A} onNextField={onNextField} />);

    fireEvent.keyDown(getByTestId("strip-color"), { key: "Tab" });

    expect(onNextField).not.toHaveBeenCalled();
  });

  it("Enter in the strip text input dispatches confirm and next", () => {
    const onConfirmNextField = vi.fn();
    const { getByTestId } = render(
      <Harness docId={DOC_A} onConfirmNextField={onConfirmNextField} />,
    );

    fireEvent.keyDown(getByTestId("strip-text"), { key: "Enter" });

    expect(onConfirmNextField).toHaveBeenCalledTimes(1);
  });

  it("PageUp dispatches page navigation and Ctrl+F opens search from the strip", () => {
    const onPreviousPage = vi.fn();
    const onOpenSearch = vi.fn();
    const { baseElement, getByTestId } = render(
      <Harness
        docId={DOC_A}
        onPreviousPage={onPreviousPage}
        onOpenSearch={onOpenSearch}
      />,
    );
    fireEvent.keyDown(baseElement, { key: "PageUp" });
    fireEvent.keyDown(getByTestId("strip-text"), { key: "f", ctrlKey: true });
    expect(onPreviousPage).toHaveBeenCalledTimes(1);
    expect(onOpenSearch).toHaveBeenCalledTimes(1);
  });

  it("Ctrl+2 toggles book mode and Ctrl+Page keys dispatch spread navigation", () => {
    const onToggleBookMode = vi.fn();
    const onPreviousSpread = vi.fn();
    const onNextSpread = vi.fn();
    const { baseElement } = render(
      <Harness
        docId={DOC_A}
        onToggleBookMode={onToggleBookMode}
        onPreviousSpread={onPreviousSpread}
        onNextSpread={onNextSpread}
      />,
    );

    fireEvent.keyDown(baseElement, { key: "2", ctrlKey: true });
    fireEvent.keyDown(baseElement, { key: "PageUp", ctrlKey: true });
    fireEvent.keyDown(baseElement, { key: "PageDown", ctrlKey: true });

    expect(onToggleBookMode).toHaveBeenCalledTimes(1);
    expect(onPreviousSpread).toHaveBeenCalledTimes(1);
    expect(onNextSpread).toHaveBeenCalledTimes(1);
  });

  // Oracle: T3.3 R1 assigns Shift+/ to the overlay on the page, never
  // while the same character is being typed into a text input.
  it("question mark opens shortcuts on the page but not inside a text input", () => {
    const onOpenShortcuts = vi.fn();
    const { baseElement, getByTestId } = render(
      <Harness docId={DOC_A} onOpenShortcuts={onOpenShortcuts} />,
    );

    fireEvent.keyDown(baseElement, { key: "?", shiftKey: true });
    expect(onOpenShortcuts).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(getByTestId("draft"), { key: "?", shiftKey: true });
    expect(onOpenShortcuts).toHaveBeenCalledTimes(1);
  });

  // Oracle: T3.1 R2 says an open search owns Escape before the existing
  // strip listener; with search closed, Escape must still reach the strip.
  it("gives open search Escape precedence and preserves closed-search strip Escape", () => {
    const onCloseSearch = vi.fn();
    const onStripEscape = vi.fn();
    const open = render(
      <Harness
        docId={DOC_A}
        searchOpen
        onCloseSearch={onCloseSearch}
        onStripEscape={onStripEscape}
      />,
    );
    fireEvent.keyDown(open.getByTestId("strip-text"), { key: "Escape" });
    expect(onCloseSearch).toHaveBeenCalledTimes(1);
    expect(onStripEscape).not.toHaveBeenCalled();
    open.unmount();

    const closed = render(
      <Harness
        docId={DOC_A}
        searchOpen={false}
        onCloseSearch={onCloseSearch}
        onStripEscape={onStripEscape}
      />,
    );
    fireEvent.keyDown(closed.getByTestId("strip-text"), { key: "Escape" });
    expect(onCloseSearch).toHaveBeenCalledTimes(1);
    expect(onStripEscape).toHaveBeenCalledTimes(1);
  });
});
