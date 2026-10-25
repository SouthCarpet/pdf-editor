// Plan 050 task D2-UX-2 (R2, R3, R5): the "Neuložené zmeny" close guard.
//
// Covers: the window listener vetoes a close only while something is
// unsaved, opens the dialog when it does, and each of the three actions -
// Save runs the existing annotations save flow then re-asks the window to
// close, Discard clears state and re-asks, Cancel leaves everything
// untouched. A document whose only unsaved work is a text draft cannot be
// saved from here, so Save keeps the dialog open with a hint.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "@/i18n";
import type { Annotation } from "@/bindings";
import { useAnnotations } from "@/stores/annotationsStore";
import { useDocuments } from "@/stores/documentStore";
import { useCloseGuard } from "@/stores/closeGuardStore";
import { useFilledFields } from "@/stores/filledFieldsStore";
import { hasDirtyFormDraft, useFormDrafts, type FormPlace } from "@/stores/formDraftStore";
import { CloseGuardDialog } from "../CloseGuardDialog";

const DOC_A = "A:\\docs\\a.pdf";
const DOC_B = "A:\\docs\\b.pdf";
const OUTPUT_PATH = "A:\\docs\\a.annotated.pdf";
const PLACE: FormPlace = { kind: "text", page_index: 0, rect: [36, 700, 240, 724] };

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
  readFormFieldsCmd: vi.fn(),
  setFormValuesCmd: vi.fn(),
}));
vi.mock("@/bindings", () => ({ commands: commandFakes }));

// The vendor window module is mocked, not `@/tauri/windowClose` - so the
// real wiring (veto only while dirty, re-ask to close after a decision) is
// what these tests exercise.
const tauriWindow = vi.hoisted(() => ({
  handler: null as null | ((event: { preventDefault: () => void }) => void),
  close: vi.fn(async () => {}),
}));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onCloseRequested: vi.fn(async (cb: (event: { preventDefault: () => void }) => void) => {
      tauriWindow.handler = cb;
      return () => {
        tauriWindow.handler = null;
      };
    }),
    close: tauriWindow.close,
  }),
}));

import { fakeBridge, resetFakeBridge } from "@/test/fakeTauriBridge";

describe("CloseGuardDialog - window scope", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("sk");
    vi.clearAllMocks();
    resetFakeBridge();
    tauriWindow.handler = null;
    tauriWindow.close.mockClear();
    commandFakes.applyAnnotationsCmd.mockResolvedValue({ status: "ok", data: [] });
    commandFakes.autosaveDelete.mockResolvedValue({ status: "ok", data: null });
    commandFakes.readFormFieldsCmd.mockResolvedValue({
      status: "ok",
      data: [
        {
          id: "10:0",
          name: "Applicant",
          kind: "text",
          value: "Alice",
          page_index: 0,
          rect: [36, 700, 240, 724],
          options: [],
          read_only: false,
          required: true,
        },
      ],
    });
    commandFakes.setFormValuesCmd.mockResolvedValue({ status: "ok", data: null });
    useFormDrafts.setState({ byDoc: {} });
    useAnnotations.setState({ byDoc: {}, mode: "highlight" });
    useDocuments.setState({ documents: new Map(), activeDocId: null });
    useCloseGuard.setState({ request: null });
    useFilledFields.setState({ byDoc: {} });
    useDocuments.getState().add({ id: DOC_A, path: DOC_A, pageCount: 1, dirty: false });
  });

  // Oracle: 119-K5 finding 5. Save leads; Discard keeps its danger meaning
  // without a second solid ink block in the same close dialog.
  it("has one solid Save action and an outlined destructive Discard action", () => {
    useCloseGuard.getState().open({ kind: "tab", docId: DOC_A, onClosed: () => {} });
    render(<CloseGuardDialog />);
    expect(screen.getByRole("button", { name: "Uložiť" })).toHaveClass("k-btn-primary");
    expect(screen.getByRole("button", { name: "Neukladať" })).toHaveClass(
      "k-btn-secondary", "text-[var(--color-danger)]",
    );
    expect(document.querySelectorAll(".k-btn-primary, .k-btn-danger")).toHaveLength(1);
  });

  /** Fires one OS close request and reports whether it was vetoed. */
  async function triggerClose() {
    await waitFor(() => expect(tauriWindow.handler).not.toBeNull());
    const preventDefault = vi.fn();
    await tauriWindow.handler!({ preventDefault });
    return preventDefault;
  }

  it("does not veto the close when no document has unsaved work", async () => {
    render(<CloseGuardDialog />);
    const preventDefault = await triggerClose();
    expect(preventDefault).not.toHaveBeenCalled();
    expect(tauriWindow.close).not.toHaveBeenCalled();
    expect(screen.queryByText("Neuložené zmeny")).toBeNull();
  });

  it("shows the dialog, naming the dirty document, instead of closing", async () => {
    useAnnotations.getState().add(DOC_A, NOTE);
    render(<CloseGuardDialog />);
    const preventDefault = await triggerClose();
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(tauriWindow.close).not.toHaveBeenCalled();
    expect(await screen.findByText("Neuložené zmeny")).toBeInTheDocument();
    expect(screen.getByText(/a\.pdf/)).toBeInTheDocument();
    // F7 regression: the dialog's own X close button used the English
    // default ("Close") regardless of the active locale.
    expect(screen.getByRole("button", { name: "Zavrieť" })).toBeInTheDocument();
  });

  it("Zrušiť closes the dialog and leaves the window open and the work intact", async () => {
    useAnnotations.getState().add(DOC_A, NOTE);
    const user = userEvent.setup();
    render(<CloseGuardDialog />);
    await triggerClose();

    await user.click(await screen.findByRole("button", { name: "Zrušiť" }));

    expect(tauriWindow.close).not.toHaveBeenCalled();
    expect(screen.queryByText("Neuložené zmeny")).toBeNull();
    expect(useAnnotations.getState().byDoc[DOC_A]).toHaveLength(1);
  });

  it("Neukladať discards the pending annotation and closes", async () => {
    useAnnotations.getState().add(DOC_A, NOTE);
    const user = userEvent.setup();
    render(<CloseGuardDialog />);
    await triggerClose();

    await user.click(await screen.findByRole("button", { name: "Neukladať" }));

    expect(fakeBridge.pickSavePath).not.toHaveBeenCalled();
    expect(useAnnotations.getState().byDoc[DOC_A]).toHaveLength(0);
    await waitFor(() => expect(tauriWindow.close).toHaveBeenCalledTimes(1));
  });

  it("Neukladať deletes the autosave row before the document closes", async () => {
    useAnnotations.getState().add(DOC_A, NOTE);
    const user = userEvent.setup();
    render(<CloseGuardDialog />);
    await triggerClose();

    await user.click(await screen.findByRole("button", { name: "Neukladať" }));

    await waitFor(() => expect(commandFakes.autosaveDelete).toHaveBeenCalledWith(DOC_A));
    await waitFor(() => expect(tauriWindow.close).toHaveBeenCalledTimes(1));
    const deleteOrder = commandFakes.autosaveDelete.mock.invocationCallOrder[0];
    const closeOrder = tauriWindow.close.mock.invocationCallOrder[0];
    expect(deleteOrder).toBeLessThan(closeOrder);
  });

  it("Uložiť runs the annotations save flow, then closes", async () => {
    useAnnotations.getState().add(DOC_A, NOTE);
    fakeBridge.pickSavePath.mockResolvedValue(OUTPUT_PATH);
    const user = userEvent.setup();
    render(<CloseGuardDialog />);
    await triggerClose();

    await user.click(await screen.findByRole("button", { name: "Uložiť" }));

    await waitFor(() => expect(commandFakes.applyAnnotationsCmd).toHaveBeenCalledTimes(1));
    expect(commandFakes.applyAnnotationsCmd).toHaveBeenCalledWith(
      expect.objectContaining({ input: DOC_A, output: OUTPUT_PATH }),
    );
    expect(useAnnotations.getState().byDoc[DOC_A]).toHaveLength(0);
    expect(tauriWindow.close).toHaveBeenCalledTimes(1);
  });

  it("Uložiť stays open when the save dialog is cancelled", async () => {
    useAnnotations.getState().add(DOC_A, NOTE);
    fakeBridge.pickSavePath.mockResolvedValue(null);
    const user = userEvent.setup();
    render(<CloseGuardDialog />);
    await triggerClose();

    await user.click(await screen.findByRole("button", { name: "Uložiť" }));

    await waitFor(() => expect(fakeBridge.pickSavePath).toHaveBeenCalled());
    expect(commandFakes.applyAnnotationsCmd).not.toHaveBeenCalled();
    expect(tauriWindow.close).not.toHaveBeenCalled();
    expect(useAnnotations.getState().byDoc[DOC_A]).toHaveLength(1);
    expect(screen.getByText("Neuložené zmeny")).toBeInTheDocument();
  });

  it("the re-issued close is no longer vetoed after Neukladať", async () => {
    useAnnotations.getState().add(DOC_A, NOTE);
    const user = userEvent.setup();
    render(<CloseGuardDialog />);
    expect(await triggerClose()).toHaveBeenCalledTimes(1);

    await user.click(await screen.findByRole("button", { name: "Neukladať" }));
    await waitFor(() => expect(tauriWindow.close).toHaveBeenCalledTimes(1));

    expect(await triggerClose()).not.toHaveBeenCalled();
  });

  it("Uložiť keeps the dialog open when only a text draft is unsaved", async () => {
    useDocuments.getState().markDirty(DOC_A, true);
    const user = userEvent.setup();
    render(<CloseGuardDialog />);
    await triggerClose();

    await user.click(await screen.findByRole("button", { name: "Uložiť" }));

    expect(
      await screen.findByText("Najskôr použite Použiť v úprave textu. Potom uložte."),
    ).toBeInTheDocument();
    expect(fakeBridge.pickSavePath).not.toHaveBeenCalled();
    expect(commandFakes.applyAnnotationsCmd).not.toHaveBeenCalled();
    expect(tauriWindow.close).not.toHaveBeenCalled();
    expect(useDocuments.getState().documents.get(DOC_A)?.dirty).toBe(true);
    expect(screen.getByText("Neuložené zmeny")).toBeInTheDocument();
  });

  it("Uložiť saves pending annotations but keeps the dialog open when a text draft remains", async () => {
    useAnnotations.getState().add(DOC_A, NOTE);
    useDocuments.getState().markDirty(DOC_A, true);
    fakeBridge.pickSavePath.mockResolvedValue(OUTPUT_PATH);
    const user = userEvent.setup();
    render(<CloseGuardDialog />);
    await triggerClose();

    await user.click(await screen.findByRole("button", { name: "Uložiť" }));

    await waitFor(() => expect(commandFakes.applyAnnotationsCmd).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByText("Najskôr použite Použiť v úprave textu. Potom uložte."),
    ).toBeInTheDocument();
    expect(useAnnotations.getState().byDoc[DOC_A]).toHaveLength(0);
    expect(useDocuments.getState().documents.get(DOC_A)?.dirty).toBe(true);
    expect(tauriWindow.close).not.toHaveBeenCalled();
    expect(screen.getByText("Neuložené zmeny")).toBeInTheDocument();
  });

  it("Neukladať clears a text-draft-only document and closes", async () => {
    useDocuments.getState().markDirty(DOC_A, true);
    const user = userEvent.setup();
    render(<CloseGuardDialog />);
    await triggerClose();

    await user.click(await screen.findByRole("button", { name: "Neukladať" }));

    expect(useDocuments.getState().documents.get(DOC_A)?.dirty).toBe(false);
    await waitFor(() => expect(tauriWindow.close).toHaveBeenCalledTimes(1));
  });

  // Plan 119 p1c: a typed AcroForm value is unsaved work. The close guard
  // asks, saves it on Uložiť and drops it on Neukladať.
  it("asks before closing when only an AcroForm value is typed", async () => {
    useFormDrafts.getState().setValue(DOC_A, "10:0", "Bob", PLACE);
    render(<CloseGuardDialog />);

    const preventDefault = await triggerClose();

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(tauriWindow.close).not.toHaveBeenCalled();
    expect(await screen.findByText("Neuložené zmeny")).toBeInTheDocument();
  });

  it("Uložiť writes the typed AcroForm value, then closes", async () => {
    useFormDrafts.getState().setValue(DOC_A, "10:0", "Bob", PLACE);
    fakeBridge.pickSavePath.mockResolvedValue(OUTPUT_PATH);
    const user = userEvent.setup();
    render(<CloseGuardDialog />);
    await triggerClose();

    await user.click(await screen.findByRole("button", { name: "Uložiť" }));

    await waitFor(() => expect(commandFakes.setFormValuesCmd).toHaveBeenCalledTimes(1));
    expect(commandFakes.setFormValuesCmd).toHaveBeenCalledWith(
      expect.objectContaining({
        input: DOC_A,
        output: OUTPUT_PATH,
        updates: [{ field_id: "10:0", value: "Bob" }],
      }),
    );
    expect(hasDirtyFormDraft(DOC_A)).toBe(false);
    await waitFor(() => expect(tauriWindow.close).toHaveBeenCalledTimes(1));
  });

  it("Neukladať drops the typed AcroForm value and closes", async () => {
    useFormDrafts.getState().setValue(DOC_A, "10:0", "Bob", PLACE);
    const user = userEvent.setup();
    render(<CloseGuardDialog />);
    await triggerClose();

    await user.click(await screen.findByRole("button", { name: "Neukladať" }));

    expect(commandFakes.setFormValuesCmd).not.toHaveBeenCalled();
    expect(hasDirtyFormDraft(DOC_A)).toBe(false);
    expect(useFormDrafts.getState().byDoc[DOC_A]).toBeUndefined();
    await waitFor(() => expect(tauriWindow.close).toHaveBeenCalledTimes(1));
  });

  it("lists every dirty document when several are open", async () => {
    useDocuments.getState().add({ id: DOC_B, path: DOC_B, pageCount: 1, dirty: false });
    useAnnotations.getState().add(DOC_A, NOTE);
    useAnnotations.getState().add(DOC_B, NOTE);
    render(<CloseGuardDialog />);
    await triggerClose();

    const description = await screen.findByText(/a\.pdf/);
    expect(description).toHaveTextContent("a.pdf");
    expect(description).toHaveTextContent("b.pdf");
  });
});

describe("CloseGuardDialog - tab scope", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("sk");
    vi.clearAllMocks();
    resetFakeBridge();
    tauriWindow.handler = null;
    tauriWindow.close.mockClear();
    commandFakes.applyAnnotationsCmd.mockResolvedValue({ status: "ok", data: [] });
    commandFakes.autosaveDelete.mockResolvedValue({ status: "ok", data: null });
    useAnnotations.setState({ byDoc: {}, mode: "highlight" });
    useDocuments.setState({ documents: new Map(), activeDocId: null });
    useCloseGuard.setState({ request: null });
    useFilledFields.setState({ byDoc: {} });
    useDocuments.getState().add({ id: DOC_A, path: DOC_A, pageCount: 1, dirty: false });
  });

  it("Neukladať runs the tab's onClosed callback instead of destroying the window", async () => {
    useAnnotations.getState().add(DOC_A, NOTE);
    const onClosed = vi.fn();
    render(<CloseGuardDialog />);
    useCloseGuard.getState().open({ kind: "tab", docId: DOC_A, onClosed });

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Neukladať" }));

    await waitFor(() => expect(onClosed).toHaveBeenCalledTimes(1));
    expect(commandFakes.autosaveDelete).toHaveBeenCalledWith(DOC_A);
    expect(tauriWindow.close).not.toHaveBeenCalled();
  });

  it("Uložiť runs the same save flow, then runs the tab's onClosed callback", async () => {
    useAnnotations.getState().add(DOC_A, NOTE);
    fakeBridge.pickSavePath.mockResolvedValue(OUTPUT_PATH);
    const onClosed = vi.fn();
    render(<CloseGuardDialog />);
    useCloseGuard.getState().open({ kind: "tab", docId: DOC_A, onClosed });

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Uložiť" }));

    await waitFor(() => expect(commandFakes.applyAnnotationsCmd).toHaveBeenCalledTimes(1));
    expect(commandFakes.applyAnnotationsCmd).toHaveBeenCalledWith(
      expect.objectContaining({ input: DOC_A, output: OUTPUT_PATH }),
    );
    expect(useAnnotations.getState().byDoc[DOC_A]).toHaveLength(0);
    expect(onClosed).toHaveBeenCalledTimes(1);
    expect(tauriWindow.close).not.toHaveBeenCalled();
  });

  it("Zrušiť does not run the tab's onClosed callback", async () => {
    useAnnotations.getState().add(DOC_A, NOTE);
    const onClosed = vi.fn();
    render(<CloseGuardDialog />);
    useCloseGuard.getState().open({ kind: "tab", docId: DOC_A, onClosed });

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Zrušiť" }));

    expect(onClosed).not.toHaveBeenCalled();
    expect(useAnnotations.getState().byDoc[DOC_A]).toHaveLength(1);
  });
});
