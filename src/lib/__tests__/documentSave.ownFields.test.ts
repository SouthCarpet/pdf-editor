import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Annotation } from "@/bindings";
import { useAnnotations } from "@/stores/annotationsStore";
import { useDocuments } from "@/stores/documentStore";
import { historyStore } from "@/stores/historyStore";
import { useFormDrafts } from "@/stores/formDraftStore";
import { useFilledFields } from "@/stores/filledFieldsStore";
import { usePrefillStore } from "@/stores/prefillStore";
import { useAppStore } from "@/stores/appStore";

vi.mock("@/tauri/bridge", async () => (await import("@/test/fakeTauriBridge")).fakeBridge);
const commandStubs = vi.hoisted(() => ({
  applyAnnotationsCmd: vi.fn(), autosaveDelete: vi.fn(),
  readFormFieldsCmd: vi.fn(), setFormValuesCmd: vi.fn(),
}));
vi.mock("@/bindings", () => ({ commands: commandStubs }));
import { fakeBridge, resetFakeBridge } from "@/test/fakeTauriBridge";
import { saveDocument } from "../documentSave";

const DOC = "A:/docs/form.pdf";
const OUTPUT = "A:/docs/saved.pdf";
const FIELD: Annotation = {
  type: "form_field", page: 0, rect: [100, 650, 240, 672],
  name: "Meno", kind: "text", multiline: false, font_size: 0,
};

describe("own field save (plan 119 §2.3)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetFakeBridge();
    useAnnotations.setState({ byDoc: {} });
    historyStore.setState({ byDoc: {} });
    useFormDrafts.setState({ byDoc: {} });
    useFilledFields.setState({ byDoc: {} });
    useDocuments.setState({ documents: new Map(), activeDocId: null });
    useDocuments.getState().add({ id: DOC, path: DOC, pageCount: 1, dirty: false });
    useAppStore.setState({ defaultSaveFolder: null });
    usePrefillStore.setState({ records: [], layoutsByDoc: {}, dismissedDocIds: [] });
    fakeBridge.pickSavePath.mockResolvedValue(OUTPUT);
    commandStubs.applyAnnotationsCmd.mockResolvedValue({ status: "ok", data: [{ object: 7, generation: 0 }] });
    commandStubs.autosaveDelete.mockResolvedValue({ status: "ok", data: null });
    commandStubs.setFormValuesCmd.mockResolvedValue({ status: "ok", data: null });
    commandStubs.readFormFieldsCmd.mockResolvedValue({ status: "ok", data: [{
      id: "10:0", name: "Existing", kind: "text", value: null,
      page_index: 0, rect: [36, 700, 240, 724], options: [], read_only: false, required: false,
    }] });
  });

  it("T5 writes typed values before the own field, clears pending work, and saves again without a write", async () => {
    useAnnotations.getState().add(DOC, FIELD);
    useFormDrafts.getState().setValue(DOC, "10:0", "Alice", {
      kind: "text", page_index: 0, rect: [36, 700, 240, 724],
    });
    expect(await saveDocument(DOC)).toBe("saved");
    expect(commandStubs.setFormValuesCmd.mock.invocationCallOrder[0]).toBeLessThan(
      commandStubs.applyAnnotationsCmd.mock.invocationCallOrder[0],
    );
    expect(commandStubs.setFormValuesCmd).toHaveBeenCalledWith(expect.objectContaining({
      input: DOC, output: OUTPUT, updates: [{ field_id: "10:0", value: "Alice" }],
    }));
    expect(commandStubs.applyAnnotationsCmd).toHaveBeenCalledWith(expect.objectContaining({
      input: OUTPUT, output: OUTPUT, annotations: [FIELD], replaced: [],
    }));
    expect(await saveDocument(DOC)).toBe("saved");
    expect(commandStubs.applyAnnotationsCmd).toHaveBeenCalledTimes(1);
    expect(useAnnotations.getState().byDoc[DOC]).toEqual([]);
  });

  it("T8 saves an own field at a remembered fill position without creating a prefill entry", async () => {
    usePrefillStore.getState().rememberLayout(DOC, { width: 612, height: 792 }, [{
      id: "0:0", page_index: 0, rect: [100, 650, 240, 672], confidence: 1,
      kind: "box",
    }]);
    useAnnotations.getState().add(DOC, FIELD);
    expect(await saveDocument(DOC)).toBe("saved");
    expect(usePrefillStore.getState().records).toEqual([]);
  });

  it("T10 keeps a move made during save and replaces object 7 on the second save", async () => {
    const id = useAnnotations.getState().add(DOC, FIELD);
    let finishWrite!: (result: { status: "ok"; data: { object: number; generation: number }[] }) => void;
    const write = new Promise((resolve) => { finishWrite = resolve; });
    let signalStarted!: () => void;
    const started = new Promise<void>((resolve) => { signalStarted = resolve; });
    commandStubs.applyAnnotationsCmd.mockImplementationOnce(() => {
      signalStarted();
      return write;
    });
    const saving = saveDocument(DOC);
    await started;
    useAnnotations.getState().update(DOC, id, { rect: [100, 600, 240, 622] });
    finishWrite({ status: "ok", data: [{ object: 7, generation: 0 }] });
    expect(await saving).toBe("saved");
    expect(useAnnotations.getState().byDoc[DOC]).toEqual([{
      ...FIELD, rect: [100, 600, 240, 622], __clientId: id, __replaces: { object: 7, generation: 0 },
    }]);
    expect(await saveDocument(DOC)).toBe("saved");
    expect(commandStubs.applyAnnotationsCmd).toHaveBeenNthCalledWith(2, expect.objectContaining({
      input: OUTPUT, annotations: [{ ...FIELD, rect: [100, 600, 240, 622] }],
      replaced: [{ object: 7, generation: 0 }],
    }));
    expect(commandStubs.applyAnnotationsCmd).toHaveBeenCalledTimes(2);
  });
});
