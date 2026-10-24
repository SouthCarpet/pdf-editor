import { useState } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "@/i18n";
import { useAnnotations } from "@/stores/annotationsStore";
import { historyStore } from "@/stores/historyStore";
import { useDocuments } from "@/stores/documentStore";
import { useFormDrafts } from "@/stores/formDraftStore";
import { saveDocument } from "@/lib/documentSave";
import { EditFormsPanel } from "../EditFormsPanel";
import { selectSavedOwnField } from "../../savedOwnFields";
import type { FormField } from "@/bindings";

const stubs = vi.hoisted(() => ({
  readFormFieldsCmd: vi.fn(), applyAnnotationsCmd: vi.fn(),
  autosavePut: vi.fn(), autosaveDelete: vi.fn(),
}));
vi.mock("@/bindings", () => ({ commands: stubs }));
vi.mock("@/tauri/bridge", async () => (await import("@/test/fakeTauriBridge")).fakeBridge);
const DOC = "A:/tmp/119-O4-saved/saved.pdf";
const own: FormField = {
  id: "7:0", name: "Employee", kind: "text", value: null, own: true,
  page_index: 0, rect: [100, 650, 240, 672], options: [], read_only: false, required: false,
};
function Panel() {
  const [selected, select] = useState<string | null>(null);
  return <EditFormsPanel docPath={DOC} selectedOwnFieldId={selected} onSelectOwnField={select} />;
}
beforeEach(async () => {
  vi.resetAllMocks();
  useAnnotations.setState({ byDoc: {} });
  historyStore.setState({ byDoc: {} });
  useFormDrafts.setState({ byDoc: {} });
  useDocuments.setState({ documents: new Map(), activeDocId: null });
  useDocuments.getState().add({ id: DOC, path: DOC, pageCount: 1, dirty: false });
  useDocuments.getState().setSavedPath(DOC, DOC);
  stubs.readFormFieldsCmd.mockResolvedValue({ status: "ok", data: [own] });
  stubs.applyAnnotationsCmd.mockResolvedValue({ status: "ok", data: [{ object: 8, generation: 0 }] });
  await i18n.changeLanguage("en");
});

// Oracle: O4 part 1. Selecting an own saved field stages one replacement;
// a keyboard move changes the PDF rect and Save sends the exact old ref.
it("selects a saved own field once, moves it and saves one replacement", async () => {
  const user = userEvent.setup();
  render(<Panel />);
  await user.click(await screen.findByRole("button", { name: "Edit layout: Employee" }));
  expect(useAnnotations.getState().byDoc[DOC]).toEqual([expect.objectContaining({
    type: "form_field", name: "Employee", rect: [100, 650, 240, 672],
    __replaces: { object: 7, generation: 0 },
  })]);
  await user.click(screen.getByRole("button", { name: "Employee Page 1" }));
  expect(useAnnotations.getState().byDoc[DOC]).toHaveLength(1);
  await user.click(screen.getByRole("heading", { name: "Own fields" }));
  await user.keyboard("{ArrowRight}");
  expect(await saveDocument(DOC)).toBe("saved");
  expect(stubs.applyAnnotationsCmd).toHaveBeenCalledWith(expect.objectContaining({
    input: DOC, output: DOC,
    annotations: [{ type: "form_field", page: 0, rect: [101, 650, 241, 672],
      name: "Employee", kind: "text", multiline: false, font_size: 0,
      source_field: { object: 7, generation: 0 } }],
    replaced: [{ object: 7, generation: 0 }],
  }));
});

// Oracle: O4 part 1. A source field has value controls but no layout action.
it("does not offer layout selection for an unmarked source field", async () => {
  stubs.readFormFieldsCmd.mockResolvedValue({ status: "ok", data: [{ ...own, own: false }] });
  render(<Panel />);
  await screen.findByRole("textbox", { name: "Employee" });
  expect(screen.queryByRole("button", { name: "Edit layout: Employee" })).not.toBeInTheDocument();
  expect(useAnnotations.getState().byDoc[DOC]).toBeUndefined();
});

// Oracle: O4 part 1. The action also refuses a source field when called
// directly. Selection, movement and resize each restore their prior state.
it("guards source fields and undoes selection, move and resize separately", () => {
  expect(selectSavedOwnField(DOC, { ...own, own: false })).toBeNull();
  const id = selectSavedOwnField(DOC, own)!;
  useAnnotations.getState().update(DOC, id, { rect: [101, 650, 241, 672] });
  useAnnotations.getState().update(DOC, id, { rect: [101, 650, 281, 692] });
  historyStore.getState().undo(DOC);
  expect(useAnnotations.getState().byDoc[DOC][0].rect).toEqual([101, 650, 241, 672]);
  historyStore.getState().undo(DOC);
  expect(useAnnotations.getState().byDoc[DOC][0].rect).toEqual([100, 650, 240, 672]);
  historyStore.getState().undo(DOC);
  expect(useAnnotations.getState().byDoc[DOC]).toEqual([]);
  historyStore.getState().redo(DOC);
  expect(useAnnotations.getState().byDoc[DOC][0].__replaces).toEqual({ object: 7, generation: 0 });
});

// Oracle: O4 part 1. Delete hides the layout; undo restores it; redo and
// Save remove the saved ref with no new annotation.
it("undoes and redoes a saved own field deletion and saves only its removal", async () => {
  const user = userEvent.setup();
  render(<Panel />);
  await user.click(await screen.findByRole("button", { name: "Edit layout: Employee" }));
  await user.click(screen.getByRole("button", { name: "Delete field" }));
  expect(screen.queryByRole("button", { name: "Employee Page 1" })).not.toBeInTheDocument();
  act(() => historyStore.getState().undo(DOC));
  expect(screen.getByRole("button", { name: "Employee Page 1" })).toBeInTheDocument();
  act(() => historyStore.getState().redo(DOC));
  stubs.applyAnnotationsCmd.mockResolvedValue({ status: "ok", data: [] });
  expect(await saveDocument(DOC)).toBe("saved");
  expect(stubs.applyAnnotationsCmd).toHaveBeenCalledWith(expect.objectContaining({
    annotations: [], replaced: [{ object: 7, generation: 0 }],
  }));
  expect(useAnnotations.getState().byDoc[DOC]).toEqual([]);
});

// Oracle: O4 layout rewrites preserve a specific source object. A fresh
// field with a deleted name has no source link and starts empty.
it("does not link a new field to a deleted field with the same name", async () => {
  const user = userEvent.setup();
  render(<Panel />);
  await user.click(await screen.findByRole("button", { name: "Edit layout: Employee" }));
  await user.click(screen.getByRole("button", { name: "Delete field" }));
  act(() => { useAnnotations.getState().add(DOC, {
    type: "form_field", page: 0, rect: [100, 600, 240, 622],
    name: "Employee", kind: "text", multiline: false, font_size: 0,
  }); });
  expect(await saveDocument(DOC)).toBe("saved");
  expect(stubs.applyAnnotationsCmd).toHaveBeenCalledWith(expect.objectContaining({
    annotations: [{ type: "form_field", page: 0, rect: [100, 600, 240, 622],
      name: "Employee", kind: "text", multiline: false, font_size: 0 }],
    replaced: [{ object: 7, generation: 0 }],
  }));
});

// Oracle: plan 119 rule 9 and O4. An edit made during Save replaces the
// object just written (8), including its saved-data source, on the next Save.
it("uses the newly written source when a saved own field moves during Save", async () => {
  const user = userEvent.setup();
  render(<Panel />);
  await user.click(await screen.findByRole("button", { name: "Edit layout: Employee" }));
  const id = useAnnotations.getState().byDoc[DOC][0].__clientId;
  let finish!: (result: { status: "ok"; data: { object: number; generation: number }[] }) => void;
  const write = new Promise((resolve) => { finish = resolve; });
  let signalStarted!: () => void;
  const started = new Promise<void>((resolve) => { signalStarted = resolve; });
  stubs.applyAnnotationsCmd.mockImplementationOnce(() => {
    signalStarted();
    return write;
  });
  const saving = saveDocument(DOC);
  await started;
  act(() => useAnnotations.getState().update(DOC, id, { rect: [110, 650, 250, 672] }));
  finish({ status: "ok", data: [{ object: 8, generation: 0 }] });
  expect(await saving).toBe("saved");
  expect(await saveDocument(DOC)).toBe("saved");
  expect(stubs.applyAnnotationsCmd).toHaveBeenNthCalledWith(2, expect.objectContaining({
    annotations: [{ type: "form_field", page: 0, rect: [110, 650, 250, 672],
      name: "Employee", kind: "text", multiline: false, font_size: 0,
      source_field: { object: 8, generation: 0 } }],
    replaced: [{ object: 8, generation: 0 }],
  }));
});
