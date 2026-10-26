// Plan 060 task T1 (R2): the shared save flow both the global toolbar and
// the Forms panel call. Covers the behaviour the brief names explicitly:
// first save asks for a path, a later save reuses it, Save-as always asks,
// and a document with nothing pending or only an unflushable text draft.
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Annotation } from "@/bindings";
import { useAnnotations } from "@/stores/annotationsStore";
import { useDocuments } from "@/stores/documentStore";

const DOC_A = "A:\\docs\\a.pdf";
const OUTPUT_PATH = "A:\\docs\\a.annotated.pdf";
const OTHER_PATH = "A:\\docs\\elsewhere.pdf";

const NOTE: Annotation = {
  type: "note",
  page: 0,
  x: 0,
  y: 0,
  contents: "hi",
  icon: "comment",
  color: [0, 0, 0],
};

const FILL: Annotation = {
  type: "free_text",
  page: 0,
  rect: [97, 626, 153, 640],
  contents: "",
  style: {
    font_family: "Helvetica",
    font_postscript_name: "Helvetica",
    size_pt: 8.4,
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
};

const SIGNATURE_STAMP: Annotation = {
  type: "stamp",
  page: 0,
  rect: [100, 200, 280, 260],
  image_path: "A:\\signatures\\saved-signature.png",
  scale: 1,
  rotation: 0,
  opacity: 1,
};

vi.mock("@/tauri/bridge", async () => (await import("@/test/fakeTauriBridge")).fakeBridge);

const commandFakes = vi.hoisted(() => ({
  applyAnnotationsCmd: vi.fn(),
  autosaveDelete: vi.fn(),
  readFormFieldsCmd: vi.fn(),
  setFormValuesCmd: vi.fn(),
}));
vi.mock("@/bindings", () => ({ commands: commandFakes }));

import { fakeBridge, resetFakeBridge } from "@/test/fakeTauriBridge";
import { useAppStore } from "@/stores/appStore";
import { ZOOM_DEFAULT } from "@/stores/workspaceStore";
import type { DetectedFormField } from "@/bindings";
import { fieldPositionKey, templateKey } from "@/components/workspace/prefill/templateHash";
import { usePrefillStore } from "@/stores/prefillStore";
import { saveDocument, writePendingAnnotationsCopy } from "../documentSave";
import { useFilledFields } from "@/stores/filledFieldsStore";
import {
  EMPTY_FILLED_FIELDS,
  markFieldFilled,
} from "@/components/workspace/filledFieldsState";
import { useFormDrafts, type FormPlace } from "@/stores/formDraftStore";
import { hasUnsavedWork } from "../unsavedWork";

const PLACE: FormPlace = { kind: "text", page_index: 0, rect: [36, 700, 240, 724] };

function applicant(value: string | null) {
  return {
    id: "10:0",
    name: "Applicant",
    kind: "text",
    value,
    page_index: 0,
    rect: [36, 700, 240, 724],
    options: [],
    read_only: false,
    required: true,
  };
}

describe("saveDocument", () => {
  beforeEach(() => {
    resetFakeBridge();
    commandFakes.applyAnnotationsCmd.mockReset();
    commandFakes.applyAnnotationsCmd.mockResolvedValue({ status: "ok", data: [] });
    commandFakes.autosaveDelete.mockReset();
    commandFakes.autosaveDelete.mockResolvedValue({ status: "ok", data: null });
    commandFakes.readFormFieldsCmd.mockReset();
    commandFakes.readFormFieldsCmd.mockResolvedValue({ status: "ok", data: [applicant("Alice")] });
    commandFakes.setFormValuesCmd.mockReset();
    commandFakes.setFormValuesCmd.mockResolvedValue({ status: "ok", data: null });
    useFormDrafts.setState({ byDoc: {} });
    useAnnotations.setState({ byDoc: {}, mode: "highlight" });
    useDocuments.setState({ documents: new Map(), activeDocId: null });
    useDocuments.getState().add({ id: DOC_A, path: DOC_A, pageCount: 1, dirty: false });
    useAppStore.setState({
      defaultSaveFolder: null,
      defaultZoom: ZOOM_DEFAULT,
      openLastDocumentAtStart: false,
    });
    localStorage.removeItem("pdf-editor-prefill");
    usePrefillStore.setState({ records: [], layoutsByDoc: {}, dismissedDocIds: [] });
  });

  it("returns 'saved' with nothing pending and no other dirty state", async () => {
    const outcome = await saveDocument(DOC_A);
    expect(outcome).toBe("saved");
    expect(fakeBridge.pickSavePath).not.toHaveBeenCalled();
    expect(commandFakes.applyAnnotationsCmd).not.toHaveBeenCalled();
  });

  it("returns 'nothing-to-save' when the only unsaved work is a text draft", async () => {
    useDocuments.getState().markDirty(DOC_A, true);
    const outcome = await saveDocument(DOC_A);
    expect(outcome).toBe("nothing-to-save");
    expect(fakeBridge.pickSavePath).not.toHaveBeenCalled();
  });

  it("the first save asks for a path (no savedPath yet)", async () => {
    useAnnotations.getState().add(DOC_A, NOTE);
    fakeBridge.pickSavePath.mockResolvedValue(OUTPUT_PATH);

    const outcome = await saveDocument(DOC_A);

    expect(outcome).toBe("saved");
    expect(fakeBridge.pickSavePath).toHaveBeenCalledTimes(1);
    expect(commandFakes.applyAnnotationsCmd).toHaveBeenCalledWith(
      expect.objectContaining({ input: DOC_A, output: OUTPUT_PATH }),
    );
    expect(useDocuments.getState().documents.get(DOC_A)?.savedPath).toBe(OUTPUT_PATH);
    expect(fakeBridge.pickSavePath).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: OUTPUT_PATH }),
    );
  });

  it("includes a pending signature stamp in the existing annotation save command", async () => {
    useAnnotations.getState().add(DOC_A, SIGNATURE_STAMP);
    fakeBridge.pickSavePath.mockResolvedValue(OUTPUT_PATH);

    await saveDocument(DOC_A);

    expect(commandFakes.applyAnnotationsCmd).toHaveBeenCalledWith(
      expect.objectContaining({
        input: DOC_A,
        output: OUTPUT_PATH,
        annotations: [SIGNATURE_STAMP],
      }),
    );
  });

  it("the first save opens the dialog in defaultSaveFolder when that setting is set", async () => {
    useAppStore.getState().setDefaultSaveFolder("D:\\filled");
    useAnnotations.getState().add(DOC_A, NOTE);
    fakeBridge.pickSavePath.mockResolvedValue("D:\\filled\\a.annotated.pdf");

    await saveDocument(DOC_A);

    expect(fakeBridge.pickSavePath).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: "D:\\filled\\a.annotated.pdf" }),
    );
  });

  it("Save-as opens the dialog in defaultSaveFolder when that setting is set", async () => {
    useAnnotations.getState().add(DOC_A, NOTE);
    fakeBridge.pickSavePath.mockResolvedValue(OUTPUT_PATH);
    await saveDocument(DOC_A);
    fakeBridge.pickSavePath.mockClear();

    useAppStore.getState().setDefaultSaveFolder("D:\\filled");
    useAnnotations.getState().add(DOC_A, NOTE);
    fakeBridge.pickSavePath.mockResolvedValue("D:\\filled\\a.annotated.pdf");

    await saveDocument(DOC_A, { forcePrompt: true });

    expect(fakeBridge.pickSavePath).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: "D:\\filled\\a.annotated.pdf" }),
    );
  });

  it("a later save reuses the remembered path without prompting again", async () => {
    useAnnotations.getState().add(DOC_A, NOTE);
    fakeBridge.pickSavePath.mockResolvedValue(OUTPUT_PATH);
    await saveDocument(DOC_A);
    fakeBridge.pickSavePath.mockClear();
    commandFakes.applyAnnotationsCmd.mockClear();

    useAnnotations.getState().add(DOC_A, NOTE);
    const outcome = await saveDocument(DOC_A);

    expect(outcome).toBe("saved");
    expect(fakeBridge.pickSavePath).not.toHaveBeenCalled();
    // Plan 119 p1: the second save starts from the first saved copy. It
    // used to start from the original again and overwrote the copy without
    // the values of the first save.
    expect(commandFakes.applyAnnotationsCmd).toHaveBeenCalledWith(
      expect.objectContaining({ input: OUTPUT_PATH, output: OUTPUT_PATH }),
    );
  });

  it("Save-as always asks for a path, even after an earlier save", async () => {
    useAnnotations.getState().add(DOC_A, NOTE);
    fakeBridge.pickSavePath.mockResolvedValue(OUTPUT_PATH);
    await saveDocument(DOC_A);
    fakeBridge.pickSavePath.mockClear();

    const NEW_PATH = "A:\\docs\\a-copy.pdf";
    fakeBridge.pickSavePath.mockResolvedValue(NEW_PATH);
    useAnnotations.getState().add(DOC_A, NOTE);
    const outcome = await saveDocument(DOC_A, { forcePrompt: true });

    expect(outcome).toBe("saved");
    expect(fakeBridge.pickSavePath).toHaveBeenCalledTimes(1);
    expect(commandFakes.applyAnnotationsCmd).toHaveBeenCalledWith(
      expect.objectContaining({ input: OUTPUT_PATH, output: NEW_PATH }),
    );
    expect(useDocuments.getState().documents.get(DOC_A)?.savedPath).toBe(NEW_PATH);
  });

  it("cancelling the path dialog returns 'cancelled' and leaves the pending work intact", async () => {
    useAnnotations.getState().add(DOC_A, NOTE);
    fakeBridge.pickSavePath.mockResolvedValue(null);

    const outcome = await saveDocument(DOC_A);

    expect(outcome).toBe("cancelled");
    expect(commandFakes.applyAnnotationsCmd).not.toHaveBeenCalled();
    expect(useAnnotations.getState().byDoc[DOC_A]).toHaveLength(1);
  });

  it("a failed write returns 'failed' and leaves the pending work intact", async () => {
    useAnnotations.getState().add(DOC_A, NOTE);
    fakeBridge.pickSavePath.mockResolvedValue(OUTPUT_PATH);
    commandFakes.applyAnnotationsCmd.mockResolvedValue({ status: "error", error: "boom" });

    const outcome = await saveDocument(DOC_A);

    expect(outcome).toBe("failed");
    expect(useAnnotations.getState().byDoc[DOC_A]).toHaveLength(1);
    expect(useDocuments.getState().documents.get(DOC_A)?.savedPath).toBeUndefined();
  });

  it("after a successful save with no text draft, the document has no unsaved work left", async () => {
    useAnnotations.getState().add(DOC_A, NOTE);
    fakeBridge.pickSavePath.mockResolvedValue(OUTPUT_PATH);

    await saveDocument(DOC_A);

    expect(useAnnotations.getState().byDoc[DOC_A]).toHaveLength(0);
    expect(useDocuments.getState().documents.get(DOC_A)?.dirty).toBe(false);
    expect(hasUnsavedWork(DOC_A)).toBe(false);
    expect(commandFakes.autosaveDelete).toHaveBeenCalledWith(DOC_A);
  });

  it("does not delete the autosave record when the path dialog is cancelled", async () => {
    useAnnotations.getState().add(DOC_A, NOTE);
    fakeBridge.pickSavePath.mockResolvedValue(null);

    await saveDocument(DOC_A);

    expect(commandFakes.autosaveDelete).not.toHaveBeenCalled();
  });

  it("after a successful save with a text draft, the dirty flag (and hasUnsavedWork) stays true", async () => {
    // Plan 061 T1 fix wave (F2): `dirty` is `EditTextPanel`'s in-progress
    // text draft flag, not something this save wrote - it must survive.
    useAnnotations.getState().add(DOC_A, NOTE);
    useDocuments.getState().markDirty(DOC_A, true);
    fakeBridge.pickSavePath.mockResolvedValue(OUTPUT_PATH);

    await saveDocument(DOC_A);

    expect(useAnnotations.getState().byDoc[DOC_A]).toHaveLength(0);
    expect(useDocuments.getState().documents.get(DOC_A)?.dirty).toBe(true);
    expect(hasUnsavedWork(DOC_A)).toBe(true);
  });

  it("records the latest fill for a remembered template on a successful save", async () => {
    const nameField: DetectedFormField = {
      id: "0:0",
      page_index: 0,
      rect: [100, 700, 250, 724],
      kind: "box",
      confidence: 0.9,
    };
    const fill: Annotation = {
      type: "free_text",
      page: 0,
      rect: nameField.rect,
      contents: "Peter Novák",
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
    };
    const pageSize = { width: 595, height: 842 };
    usePrefillStore.getState().rememberLayout(DOC_A, pageSize, [nameField]);
    useAnnotations.getState().add(DOC_A, fill);
    fakeBridge.pickSavePath.mockResolvedValue(OUTPUT_PATH);

    const outcome = await saveDocument(DOC_A);

    expect(outcome).toBe("saved");
    const stored = usePrefillStore
      .getState()
      .recordForTemplate(templateKey(pageSize, [nameField]));
    expect(stored?.values).toEqual({ [fieldPositionKey(nameField)]: "Peter Novák" });
  });

  it("saving one document does not touch another document's pending work or path", async () => {
    useAnnotations.getState().add(DOC_A, NOTE);
    useAnnotations.getState().add(OTHER_PATH, NOTE);
    fakeBridge.pickSavePath.mockResolvedValue(OUTPUT_PATH);

    await saveDocument(DOC_A);

    expect(useAnnotations.getState().byDoc[OTHER_PATH]).toHaveLength(1);
  });

  it("writes a temporary print copy without clearing pending annotations or changing the save path", async () => {
    useAnnotations.getState().add(DOC_A, NOTE);

    const written = await writePendingAnnotationsCopy(DOC_A, OTHER_PATH);

    expect(written).toBe(true);
    expect(commandFakes.applyAnnotationsCmd).toHaveBeenCalledWith(
      expect.objectContaining({ input: DOC_A, output: OTHER_PATH }),
    );
    expect(useAnnotations.getState().byDoc[DOC_A]).toHaveLength(1);
    expect(useDocuments.getState().documents.get(DOC_A)?.savedPath).toBeUndefined();
  });

  it("a print copy after a save starts from the saved copy, not the original", async () => {
    useAnnotations.getState().add(DOC_A, NOTE);
    fakeBridge.pickSavePath.mockResolvedValue(OUTPUT_PATH);
    await saveDocument(DOC_A);
    commandFakes.applyAnnotationsCmd.mockClear();

    await writePendingAnnotationsCopy(DOC_A, OTHER_PATH);

    expect(commandFakes.applyAnnotationsCmd).toHaveBeenCalledWith(
      expect.objectContaining({ input: OUTPUT_PATH, output: OTHER_PATH }),
    );
  });

  it("every successful save, also to the same path, gives the document a new saved revision", async () => {
    expect(useDocuments.getState().documents.get(DOC_A)?.savedRevision ?? 0).toBe(0);
    useAnnotations.getState().add(DOC_A, NOTE);
    fakeBridge.pickSavePath.mockResolvedValue(OUTPUT_PATH);
    await saveDocument(DOC_A);
    expect(useDocuments.getState().documents.get(DOC_A)?.savedRevision).toBe(1);

    useAnnotations.getState().add(DOC_A, NOTE);
    await saveDocument(DOC_A);

    expect(useDocuments.getState().documents.get(DOC_A)?.savedRevision).toBe(2);
  });

  it("keeps a value typed while the save was still writing", async () => {
    useAnnotations.getState().add(DOC_A, NOTE);
    fakeBridge.pickSavePath.mockResolvedValue(OUTPUT_PATH);
    commandFakes.applyAnnotationsCmd.mockImplementation(async () => {
      useAnnotations.getState().add(DOC_A, SIGNATURE_STAMP);
      return { status: "ok", data: [{ object: 30, generation: 0 }] };
    });

    await saveDocument(DOC_A);

    const left = useAnnotations.getState().byDoc[DOC_A] ?? [];
    expect(left.map(({ __clientId: _id, ...annotation }) => annotation)).toEqual([
      SIGNATURE_STAMP,
    ]);
  });

  // Plan 119 p1b defect 1: an edited saved value names the annotation it
  // replaces. The save removes that one and does not send the marker.
  it("sends the saved values an edit replaces, and strips the marker", async () => {
    const edit = { ...FILL, contents: "08:30", __replaces: { object: 12, generation: 0 } };
    useAnnotations.getState().add(DOC_A, edit);
    fakeBridge.pickSavePath.mockResolvedValue(OUTPUT_PATH);

    await saveDocument(DOC_A);

    expect(commandFakes.applyAnnotationsCmd).toHaveBeenCalledWith(
      expect.objectContaining({
        annotations: [{ ...FILL, contents: "08:30" }],
        replaced: [{ object: 12, generation: 0 }],
      }),
    );
  });

  // Plan 119 p1b defect 2: an edit made while its value is being written is
  // not in the file. It stays pending and replaces the value just written.
  it("keeps an edit made during the save pending, as an edit of the written value", async () => {
    const clientId = useAnnotations.getState().add(DOC_A, { ...FILL, contents: "07:00" });
    useFilledFields
      .getState()
      .setFilled(DOC_A, markFieldFilled(EMPTY_FILLED_FIELDS, "k", "0:0", clientId));
    fakeBridge.pickSavePath.mockResolvedValue(OUTPUT_PATH);
    let finishWrite: () => void = () => {};
    commandFakes.applyAnnotationsCmd.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishWrite = () => resolve({ status: "ok", data: [{ object: 40, generation: 0 }] });
        }),
    );

    const saving = saveDocument(DOC_A);
    await vi.waitFor(() => expect(commandFakes.applyAnnotationsCmd).toHaveBeenCalledTimes(1));
    useAnnotations.getState().update(DOC_A, clientId, { contents: "07:30" });
    finishWrite();
    await saving;

    const left = useAnnotations.getState().byDoc[DOC_A] ?? [];
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({
      __clientId: clientId,
      contents: "07:30",
      __replaces: { object: 40, generation: 0 },
    });
    expect(useFilledFields.getState().byDoc[DOC_A]?.fieldIdByClientId).toEqual({
      [clientId]: "0:0",
    });

    commandFakes.applyAnnotationsCmd.mockResolvedValue({ status: "ok", data: [null] });
    await saveDocument(DOC_A);
    expect(commandFakes.applyAnnotationsCmd).toHaveBeenLastCalledWith(
      expect.objectContaining({
        input: OUTPUT_PATH,
        annotations: [{ ...FILL, contents: "07:30" }],
        replaced: [{ object: 40, generation: 0 }],
      }),
    );
  });

  // Plan 119 p1c: clearing a saved value sends an empty replacement. The save
  // deletes the old object and writes nothing (the command returns null), so
  // nothing stays pending and the document is clean.
  it("saves an emptied saved value as a deletion and leaves nothing pending", async () => {
    const clientId = useAnnotations
      .getState()
      .add(DOC_A, { ...FILL, contents: "", __replaces: { object: 12, generation: 0 } });
    useFilledFields
      .getState()
      .setFilled(DOC_A, markFieldFilled(EMPTY_FILLED_FIELDS, "k", "0:0", clientId));
    fakeBridge.pickSavePath.mockResolvedValue(OUTPUT_PATH);
    commandFakes.applyAnnotationsCmd.mockResolvedValue({ status: "ok", data: [null] });

    const outcome = await saveDocument(DOC_A);

    expect(outcome).toBe("saved");
    expect(commandFakes.applyAnnotationsCmd).toHaveBeenCalledWith(
      expect.objectContaining({
        annotations: [{ ...FILL, contents: "" }],
        replaced: [{ object: 12, generation: 0 }],
      }),
    );
    expect(useAnnotations.getState().byDoc[DOC_A] ?? []).toEqual([]);
    expect(useFilledFields.getState().byDoc[DOC_A]?.ids.size ?? 0).toBe(0);
    expect(hasUnsavedWork(DOC_A)).toBe(false);
  });

  // Plan 119 p1c: the save deleted that object. A value typed while the
  // deletion wrote is a new value, not a second replacement of an object
  // that is gone (its number can be given to the next annotation).
  it("does not replace a deleted object again when a value is typed during the save", async () => {
    const clientId = useAnnotations
      .getState()
      .add(DOC_A, { ...FILL, contents: "", __replaces: { object: 12, generation: 0 } });
    fakeBridge.pickSavePath.mockResolvedValue(OUTPUT_PATH);
    let finishWrite: () => void = () => {};
    commandFakes.applyAnnotationsCmd.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishWrite = () => resolve({ status: "ok", data: [null] });
        }),
    );

    const saving = saveDocument(DOC_A);
    await vi.waitFor(() => expect(commandFakes.applyAnnotationsCmd).toHaveBeenCalledTimes(1));
    useAnnotations.getState().update(DOC_A, clientId, { contents: "09:00" });
    finishWrite();
    await saving;

    const left = useAnnotations.getState().byDoc[DOC_A] ?? [];
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({ __clientId: clientId, contents: "09:00" });
    expect(left[0]).not.toHaveProperty("__replaces");
  });

  // Plan 119 p1c: a typed AcroForm value is saved by the same flow, so the
  // toolbar, Ctrl+S and the close guard all save it.
  describe("typed AcroForm values", () => {
    it("saves a typed value on top of the document and clears the draft", async () => {
      useFormDrafts.getState().setValue(DOC_A, "10:0", "Bob", PLACE);
      fakeBridge.pickSavePath.mockResolvedValue(OUTPUT_PATH);

      const outcome = await saveDocument(DOC_A);

      expect(outcome).toBe("saved");
      expect(commandFakes.readFormFieldsCmd).toHaveBeenCalledWith(DOC_A);
      expect(commandFakes.setFormValuesCmd).toHaveBeenCalledWith(
        expect.objectContaining({
          input: DOC_A,
          output: OUTPUT_PATH,
          updates: [{ field_id: "10:0", value: "Bob" }],
        }),
      );
      expect(commandFakes.applyAnnotationsCmd).not.toHaveBeenCalled();
      expect(useDocuments.getState().documents.get(DOC_A)?.savedPath).toBe(OUTPUT_PATH);
      expect(hasUnsavedWork(DOC_A)).toBe(false);
    });

    it("a later save starts from the saved copy and does not ask for a path again", async () => {
      useFormDrafts.getState().setValue(DOC_A, "10:0", "Bob", PLACE);
      fakeBridge.pickSavePath.mockResolvedValue(OUTPUT_PATH);
      await saveDocument(DOC_A);
      commandFakes.readFormFieldsCmd.mockResolvedValue({ status: "ok", data: [applicant("Bob")] });
      useFormDrafts.getState().setValue(DOC_A, "10:0", "Carol", PLACE);

      await saveDocument(DOC_A);

      expect(fakeBridge.pickSavePath).toHaveBeenCalledTimes(1);
      expect(commandFakes.setFormValuesCmd).toHaveBeenLastCalledWith(
        expect.objectContaining({
          input: OUTPUT_PATH,
          output: OUTPUT_PATH,
          updates: [{ field_id: "10:0", value: "Carol" }],
        }),
      );
    });

    it("writes the form values first and the annotations on top of that copy", async () => {
      useFormDrafts.getState().setValue(DOC_A, "10:0", "Bob", PLACE);
      useAnnotations.getState().add(DOC_A, NOTE);
      fakeBridge.pickSavePath.mockResolvedValue(OUTPUT_PATH);

      const outcome = await saveDocument(DOC_A);

      expect(outcome).toBe("saved");
      expect(fakeBridge.pickSavePath).toHaveBeenCalledTimes(1);
      expect(commandFakes.setFormValuesCmd.mock.invocationCallOrder[0]).toBeLessThan(
        commandFakes.applyAnnotationsCmd.mock.invocationCallOrder[0],
      );
      expect(commandFakes.applyAnnotationsCmd).toHaveBeenCalledWith(
        expect.objectContaining({ input: OUTPUT_PATH, output: OUTPUT_PATH }),
      );
      expect(hasUnsavedWork(DOC_A)).toBe(false);
    });

    it("keeps the draft, and writes no annotation, when the form write fails", async () => {
      useFormDrafts.getState().setValue(DOC_A, "10:0", "Bob", PLACE);
      useAnnotations.getState().add(DOC_A, NOTE);
      fakeBridge.pickSavePath.mockResolvedValue(OUTPUT_PATH);
      commandFakes.setFormValuesCmd.mockResolvedValue({ status: "error", error: "disk full" });

      const outcome = await saveDocument(DOC_A);

      expect(outcome).toBe("failed");
      expect(commandFakes.applyAnnotationsCmd).not.toHaveBeenCalled();
      expect(hasUnsavedWork(DOC_A)).toBe(true);
      expect(useDocuments.getState().documents.get(DOC_A)?.savedPath).toBeUndefined();
    });

    it("returns cancelled and keeps the draft when the path dialog is closed", async () => {
      useFormDrafts.getState().setValue(DOC_A, "10:0", "Bob", PLACE);
      fakeBridge.pickSavePath.mockResolvedValue(null);

      expect(await saveDocument(DOC_A)).toBe("cancelled");
      expect(commandFakes.setFormValuesCmd).not.toHaveBeenCalled();
      expect(hasUnsavedWork(DOC_A)).toBe(true);
    });

    it("keeps a value typed during the write unsaved", async () => {
      useFormDrafts.getState().setValue(DOC_A, "10:0", "Bob", PLACE);
      fakeBridge.pickSavePath.mockResolvedValue(OUTPUT_PATH);
      let finishWrite: () => void = () => {};
      commandFakes.setFormValuesCmd.mockImplementation(
        () => new Promise((resolve) => (finishWrite = () => resolve({ status: "ok", data: null }))),
      );

      const saving = saveDocument(DOC_A);
      await vi.waitFor(() => expect(commandFakes.setFormValuesCmd).toHaveBeenCalledTimes(1));
      useFormDrafts.getState().setValue(DOC_A, "10:0", "Bobby", PLACE);
      finishWrite();
      await saving;

      expect(hasUnsavedWork(DOC_A)).toBe(true);
    });
  });
});
