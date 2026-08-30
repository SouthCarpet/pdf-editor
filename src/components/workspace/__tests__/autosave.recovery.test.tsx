// Plan 062 T4.3: recovery dialog. Never auto-applies; Obnoviť restores
// the same clientIds; Zahodiť deletes the record.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/i18n";
import i18n from "@/i18n";
import type { Annotation } from "@/bindings";
import { useAnnotations, type ClientAnnotation } from "@/stores/annotationsStore";
import { useDocuments } from "@/stores/documentStore";
import { useFilledFields } from "@/stores/filledFieldsStore";
import { historyStore } from "@/stores/historyStore";
import { fakeBridge, resetFakeBridge } from "@/test/fakeTauriBridge";
import { serializePendingState, type AutosaveRecord } from "../autosave";
import { DocumentAutosave } from "../DocumentAutosave";

const DOC = "A:\\scans\\hodiny.pdf";

type FreeText = Extract<Annotation, { type: "free_text" }>;

function record(): AutosaveRecord {
  const annotation: ClientAnnotation = {
    type: "free_text",
    page: 0,
    rect: [100, 700, 250, 724],
    contents: "Peter",
    style: {
      font_family: "Helvetica",
      font_postscript_name: "Helvetica",
      size_pt: 12,
      bold: false,
      italic: false,
      underline: false,
      strikethrough: false,
      color: [0, 0, 0],
      background: null,
      align: "left",
      vertical_align: "top",
      letter_spacing: 0,
      line_height_multiplier: 1.2,
    },
    background_fill: null,
    border_color: [0, 0, 0],
    border_width: 0,
    auto_resize: false,
    __clientId: "client-keep",
  };
  return serializePendingState(
    [annotation],
    { key: `${DOC}\u00000`, ids: ["0:0"], fieldIdByClientId: { "client-keep": "0:0" } },
    1_700_000_000_000,
  );
}

const commandFakes = vi.hoisted(() => ({
  autosavePut: vi.fn(),
  autosaveGet: vi.fn(),
  autosaveDelete: vi.fn(),
}));
vi.mock("@/bindings", () => ({ commands: commandFakes }));
vi.mock("@/tauri/bridge", async () => (await import("@/test/fakeTauriBridge")).fakeBridge);

describe("autosave recovery dialog", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("sk");
    vi.clearAllMocks();
    resetFakeBridge();
    commandFakes.autosavePut.mockResolvedValue({ status: "ok", data: null });
    commandFakes.autosaveDelete.mockResolvedValue({ status: "ok", data: null });
    commandFakes.autosaveGet.mockResolvedValue({
      status: "ok",
      data: JSON.stringify(record()),
    });
    fakeBridge.fileMtimeMs.mockResolvedValue(1_600_000_000_000);
    useAnnotations.setState({ byDoc: {}, mode: "highlight" });
    historyStore.setState({ byDoc: {} });
    useFilledFields.setState({ byDoc: {} });
    useDocuments.setState({ documents: new Map(), activeDocId: null });
    useDocuments.getState().add({ id: DOC, path: DOC, pageCount: 1, dirty: false });
  });

  it("offers the record and does not apply it until Obnoviť", async () => {
    render(<DocumentAutosave path={DOC} />);

    expect(
      await screen.findByRole("heading", { name: /Nájdené neuložené vyplnenie z/ }),
    ).toBeInTheDocument();
    expect(useAnnotations.getState().byDoc[DOC]).toBeUndefined();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Obnoviť" }));

    const restored = useAnnotations.getState().byDoc[DOC];
    expect(restored).toHaveLength(1);
    expect(restored[0].__clientId).toBe("client-keep");
    expect((restored[0] as ClientAnnotation & FreeText).contents).toBe("Peter");
    expect(useFilledFields.getState().byDoc[DOC].fieldIdByClientId["client-keep"]).toBe("0:0");
    expect(historyStore.getState().canUndo(DOC)).toBe(false);
    expect(useDocuments.getState().documents.get(DOC)?.dirty).toBe(true);
    expect(commandFakes.autosaveDelete).not.toHaveBeenCalled();
  });

  it("Zahodiť deletes the record and leaves stores empty", async () => {
    render(<DocumentAutosave path={DOC} />);
    expect(await screen.findByRole("button", { name: "Zahodiť" })).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Zahodiť" }));

    await waitFor(() => expect(commandFakes.autosaveDelete).toHaveBeenCalledWith(DOC));
    expect(useAnnotations.getState().byDoc[DOC]).toBeUndefined();
    expect(useDocuments.getState().documents.get(DOC)?.dirty).toBe(false);
  });

  it("does not offer a record older than the file mtime", async () => {
    fakeBridge.fileMtimeMs.mockResolvedValue(1_800_000_000_000);
    render(<DocumentAutosave path={DOC} />);
    await waitFor(() => expect(commandFakes.autosaveGet).toHaveBeenCalled());
    expect(screen.queryByRole("heading", { name: /Nájdené neuložené vyplnenie z/ })).toBeNull();
    expect(useAnnotations.getState().byDoc[DOC]).toBeUndefined();
  });
});
