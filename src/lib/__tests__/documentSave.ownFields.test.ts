import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Annotation } from "@/bindings";
import { useAnnotations } from "@/stores/annotationsStore";
import { useDocuments } from "@/stores/documentStore";
import { historyStore } from "@/stores/historyStore";
import { useFormDrafts } from "@/stores/formDraftStore";
import { useFilledFields } from "@/stores/filledFieldsStore";
import { usePrefillStore } from "@/stores/prefillStore";
import { useAppStore } from "@/stores/appStore";
import i18n from "@/i18n";

const toastStub = vi.hoisted(() => vi.fn());
vi.mock("@/components/ui/toast", () => ({ toast: toastStub }));

vi.mock("@/tauri/bridge", async () => (await import("@/test/fakeTauriBridge")).fakeBridge);
const commandStubs = vi.hoisted(() => ({
  applyAnnotationsCmd: vi.fn(), autosaveDelete: vi.fn(),
  readFormFieldsCmd: vi.fn(), setFormValuesCmd: vi.fn(),
}));
vi.mock("@/bindings", () => ({ commands: commandStubs }));
import { fakeBridge, resetFakeBridge } from "@/test/fakeTauriBridge";
import { saveDocument, writePendingAnnotationsCopy } from "../documentSave";

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

  // Oracle: E1 items 7 and 10. Own fields use the same Save-as and print-copy
  // routes as annotations; a preview cannot consume pending work.
  it("prints a pending own field without consuming it, then Save-as chooses a new path", async () => {
    useDocuments.getState().setSavedPath(DOC, OUTPUT);
    const id = useAnnotations.getState().add(DOC, FIELD);
    expect(await writePendingAnnotationsCopy(DOC, "preview.pdf")).toBe(true);
    expect(commandStubs.applyAnnotationsCmd).toHaveBeenLastCalledWith({
      input: OUTPUT, output: "preview.pdf", annotations: [FIELD], replaced: [], job_id: expect.any(String),
    });
    expect(useAnnotations.getState().byDoc[DOC][0].__clientId).toBe(id);
    expect(useDocuments.getState().documents.get(DOC)?.savedPath).toBe(OUTPUT);
    fakeBridge.pickSavePath.mockResolvedValue("copy.pdf");
    expect(await saveDocument(DOC, { forcePrompt: true })).toBe("saved");
    expect(fakeBridge.pickSavePath).toHaveBeenCalledOnce();
    expect(useDocuments.getState().documents.get(DOC)?.savedPath).toBe("copy.pdf");
  });

  // Oracle: E1 item 14. A never-written deletion has no PDF reference; a
  // saved deletion removes exactly its old object in the same save.
  it("deletes a pending and a saved own field in one save without writing either", async () => {
    const pending = useAnnotations.getState().add(DOC, FIELD);
    const saved = useAnnotations.getState().add(DOC, {
      ...FIELD, __replaces: { object: 7, generation: 0 },
    });
    useAnnotations.getState().remove(DOC, pending);
    useAnnotations.getState().remove(DOC, saved);
    commandStubs.applyAnnotationsCmd.mockResolvedValue({ status: "ok", data: [] });
    expect(await saveDocument(DOC)).toBe("saved");
    expect(commandStubs.applyAnnotationsCmd).toHaveBeenCalledWith({
      input: DOC, output: OUTPUT, annotations: [], replaced: [{ object: 7, generation: 0 }], job_id: expect.any(String),
    });
    expect(useAnnotations.getState().byDoc[DOC]).toEqual([]);
  });

  // Oracle: E1 item 8. A signature warning precedes the PDF write, without
  // a confirmation dialog or a cancelled save. Both shipped locales explain it.
  it.each([
    ["en", "Saving changes invalidates digital signatures. Keep the signed original."],
    ["sk", "Uloženie zmien zneplatní digitálne podpisy. Podpísaný originál si ponechajte."],
  ])("warns before saving an own field in a PDF with signature fields (%s)", async (language, message) => {
    await i18n.changeLanguage(language);
    commandStubs.readFormFieldsCmd.mockResolvedValue({ status: "ok", data: [{ kind: "signature" }] });
    useAnnotations.getState().add(DOC, FIELD);
    expect(await saveDocument(DOC)).toBe("saved");
    expect(toastStub).toHaveBeenCalledWith({ title: message });
    expect(toastStub.mock.invocationCallOrder[0]).toBeLessThan(commandStubs.applyAnnotationsCmd.mock.invocationCallOrder[0]);
  });

  it("does not warn for a PDF without signature fields", async () => {
    useAnnotations.getState().add(DOC, FIELD);
    expect(await saveDocument(DOC)).toBe("saved");
    expect(toastStub).not.toHaveBeenCalled();
  });

  it("warns before saving typed values in a PDF with signature fields", async () => {
    await i18n.changeLanguage("en");
    commandStubs.readFormFieldsCmd.mockResolvedValue({ status: "ok", data: [
      { id: "10:0", kind: "text", value: null }, { id: "11:0", kind: "signature", value: null },
    ] });
    useFormDrafts.getState().setValue(DOC, "10:0", "Alice", {
      kind: "text", page_index: 0, rect: [36, 700, 240, 724],
    });
    expect(await saveDocument(DOC)).toBe("saved");
    expect(toastStub).toHaveBeenCalledOnce();
    expect(toastStub.mock.invocationCallOrder[0]).toBeLessThan(commandStubs.setFormValuesCmd.mock.invocationCallOrder[0]);
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
    expect(await saveDocument(DOC)).toBe("saved");
    expect(commandStubs.applyAnnotationsCmd).toHaveBeenCalledTimes(2);
  });
});
