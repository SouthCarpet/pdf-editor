import { useState } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "@/i18n";
import type { OwnFieldKind } from "@/bindings";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { ClientAnnotation } from "@/stores/annotationsStore";
import { useAnnotations } from "@/stores/annotationsStore";
import { historyStore } from "@/stores/historyStore";
import { useDocuments } from "@/stores/documentStore";
import { useFormDrafts } from "@/stores/formDraftStore";
import { EditFormsPanel } from "../EditFormsPanel";
import { Workspace } from "../../Workspace";
import { useWorkspace } from "@/stores/workspaceStore";

vi.mock("@/bindings", () => ({
  commands: {
    readFormFieldsCmd: vi.fn().mockResolvedValue({ status: "ok", data: [] }),
    autosavePut: vi.fn().mockResolvedValue(null),
  },
}));
vi.mock("@/tauri/bridge", async () => (await import("@/test/fakeTauriBridge")).fakeBridge);
// Canvas rendering belongs to the real-app capture. These two ports expose
// which overlay Workspace mounts, with the actual pending annotation data.
vi.mock("../../EditPageOverlay", () => ({
  EditPageOverlay: ({
    pendingAnnotations,
    page,
    ownFieldsEditable,
  }: {
    pendingAnnotations: ClientAnnotation[];
    page: number;
    ownFieldsEditable: boolean;
  }) => (
    <div data-testid="editable-own-fields" data-own-editable={String(ownFieldsEditable)}>
      {pendingAnnotations
        .flatMap((a) => (a.type === "form_field" && a.page === page ? [a.name] : []))
        .join(",")}
    </div>
  ),
  PendingPreviewOverlay: ({
    pendingAnnotations,
    page,
  }: {
    pendingAnnotations: ClientAnnotation[];
    page: number;
  }) => (
    <div data-testid="preview-own-fields">
      {pendingAnnotations
        .flatMap((a) => (a.type === "form_field" && a.page === page ? [a.name] : []))
        .join(",")}
    </div>
  ),
}));
vi.mock("../../PdfViewer", () => ({ PdfViewer: () => <div /> }));
vi.mock("../../ThumbnailStrip", () => ({ ThumbnailStrip: () => <div /> }));
vi.mock("../../WorkspaceTopBar", () => ({ WorkspaceTopBar: () => <div /> }));
vi.mock("../EditTextPanel", () => ({ EditTextPanel: () => <div /> }));
vi.mock("../EditAnnotationsPanel", () => ({ EditAnnotationsPanel: () => <div /> }));
vi.mock("@/hooks/usePdfDocument", () => ({ usePdfDocument: () => null }));

const DOC = "A:/tmp/119-O3-ui/scan.pdf";

function pdfPages(numPages: number): PDFDocumentProxy {
  return {
    numPages,
    getPage: async () => ({
      getViewport: ({ scale }: { scale: number }) => ({
        width: 612 * scale,
        height: 792 * scale,
        scale,
        viewBox: [0, 0, 612, 792],
      }),
      getAnnotations: async () => [],
    }),
  } as unknown as PDFDocumentProxy;
}

function Panel({ selectedId = null }: { selectedId?: string | null }) {
  const [fieldPlacement, setFieldPlacement] = useState<OwnFieldKind | null>(null);
  const [selection, setSelection] = useState(selectedId);
  return (
    <>
      <output data-testid="placement">{fieldPlacement ?? "none"}</output>
      <EditFormsPanel
        docPath={DOC}
        fieldPlacement={fieldPlacement}
        onFieldPlacementChange={setFieldPlacement}
        selectedOwnFieldId={selection}
        onSelectOwnField={setSelection}
        pageBox={[0, 0, 612, 792]}
      />
    </>
  );
}

beforeEach(async () => {
  useAnnotations.setState({ byDoc: {} });
  historyStore.setState({ byDoc: {} });
  useDocuments.setState({ documents: new Map(), activeDocId: null });
  useFormDrafts.setState({ byDoc: {} });
  useWorkspace.setState({
    activeTool: "edit",
    editSubTool: "forms",
    activePage: 0,
    zoomByDoc: { [DOC]: 1 },
    zoomModeByDoc: { [DOC]: "custom" },
    bookModeByDoc: {},
  });
  await i18n.changeLanguage("en");
});

// Oracle: plan 119 §2.1, Every mode. A pending field must retain its
// editable overlay after placement ends and remain visible in Text mode.
it("keeps an own field on the page after placement, then previews it in Text mode", async () => {
  const user = userEvent.setup();
  useAnnotations.getState().add(DOC, {
    type: "form_field",
    page: 0,
    rect: [100, 650, 240, 672],
    name: "Employee",
    kind: "text",
    multiline: false,
    font_size: 12,
  });
  render(<Workspace pdf={pdfPages(1)} path={DOC} />);
  expect(await screen.findByTestId("editable-own-fields")).toHaveTextContent("Employee");
  expect(screen.getByTestId("editable-own-fields")).toHaveAttribute("data-own-editable", "true");
  await user.click(screen.getByRole("button", { name: "Employee Page 1" }));
  await user.click(screen.getByRole("button", { name: "Annotations" }));
  expect(screen.getByTestId("editable-own-fields")).toHaveAttribute("data-own-editable", "false");
  await user.keyboard("{Delete}");
  expect(useAnnotations.getState().byDoc[DOC]).toHaveLength(1);
  await user.click(screen.getByRole("button", { name: "Text" }));
  expect(await screen.findByTestId("preview-own-fields")).toHaveTextContent("Employee");
});

// Oracle: the same Every mode rule on a book spread. Page 3 starts as the
// facing page; choosing its pending field in the list makes it editable.
it("previews a facing-page own field and selects its page from the pending list", async () => {
  const user = userEvent.setup();
  useWorkspace.setState({ activePage: 1, bookModeByDoc: { [DOC]: true } });
  useAnnotations.getState().add(DOC, {
    type: "form_field",
    page: 2,
    rect: [100, 650, 240, 672],
    name: "Employee",
    kind: "text",
    multiline: false,
    font_size: 12,
  });
  render(<Workspace pdf={pdfPages(3)} path={DOC} />);
  expect(await screen.findByTestId("preview-own-fields")).toHaveTextContent("Employee");
  await user.click(screen.getByRole("button", { name: "Employee Page 3" }));
  expect(useWorkspace.getState().activePage).toBe(2);
  expect(await screen.findByTestId("editable-own-fields")).toHaveTextContent("Employee");
});

// Oracle: plan 119 §2.3 T7. Real panel actions must change placement and
// annotation state; the selected pending field has the literal initial rect.
it("T7: Text field enters placement, Escape cancels, name edits and Delete removes the selected field", async () => {
  const user = userEvent.setup();
  const id = useAnnotations.getState().add(DOC, {
    type: "form_field",
    page: 0,
    rect: [100, 650, 240, 672],
    name: "Field",
    kind: "text",
    multiline: false,
    font_size: 12,
  });
  render(<Panel selectedId={id} />);
  await user.click(await screen.findByRole("button", { name: "Text field" }));
  expect(screen.getByTestId("placement")).toHaveTextContent("text");
  await user.keyboard("{Escape}");
  expect(screen.getByTestId("placement")).toHaveTextContent("none");
  const name = screen.getByRole("textbox", { name: "Field name" });
  await user.clear(name);
  await user.type(name, "Employee");
  expect(useAnnotations.getState().byDoc[DOC][0]).toMatchObject({ name: "Employee" });
  await user.keyboard("{Delete}");
  expect(useAnnotations.getState().byDoc[DOC]).toHaveLength(1);
  await user.click(screen.getByRole("heading", { name: "Own fields" }));
  await user.keyboard("{Delete}");
  expect(useAnnotations.getState().byDoc[DOC]).toEqual([]);
  act(() => historyStore.getState().undo(DOC));
  expect(useAnnotations.getState().byDoc[DOC][0]).toMatchObject({ name: "Employee" });
});

// Oracle: plan 119 §2.1. Keyboard moves use PDF points, the box stays on
// the page, and text properties remain independent of its geometry.
it("moves a text field 1 pt or 10 pt, clamps it, and edits multiline and font size", async () => {
  const user = userEvent.setup();
  const id = useAnnotations.getState().add(DOC, {
    type: "form_field",
    page: 0,
    rect: [1, 650, 141, 672],
    name: "Field",
    kind: "text",
    multiline: false,
    font_size: 12,
  });
  render(<Panel selectedId={id} />);
  await screen.findByRole("textbox", { name: "Field name" });
  await user.click(screen.getByRole("heading", { name: "Own fields" }));
  await user.keyboard("{ArrowRight}{Shift>}{ArrowLeft}{/Shift}{ArrowUp}");
  expect(useAnnotations.getState().byDoc[DOC][0]).toMatchObject({ rect: [0, 651, 140, 673] });
  await user.click(screen.getByRole("checkbox", { name: "Multiline" }));
  const size = screen.getByRole("spinbutton", { name: "Font size (pt, 0 = auto)" });
  await user.clear(size);
  await user.type(size, "0");
  expect(useAnnotations.getState().byDoc[DOC][0]).toMatchObject({
    rect: [0, 651, 140, 673],
    multiline: true,
    font_size: 0,
  });
});

// Oracle: plan 119 §2.1: checkbox placement and panel deletion use the
// same pending annotation store, with no text-only controls.
it("starts checkbox placement and deletes a checkbox through the panel button", async () => {
  const user = userEvent.setup();
  const id = useAnnotations.getState().add(DOC, {
    type: "form_field",
    page: 0,
    rect: [100, 650, 114, 664],
    name: "Consent",
    kind: "checkbox",
    multiline: false,
    font_size: 0,
  });
  render(<Panel />);
  await user.click(await screen.findByRole("button", { name: /Consent/ }));
  expect(screen.getByRole("textbox", { name: "Field name" })).toHaveValue("Consent");
  expect(useAnnotations.getState().byDoc[DOC][0].__clientId).toBe(id);
  await user.click(screen.getByRole("button", { name: "Checkbox" }));
  expect(screen.getByTestId("placement")).toHaveTextContent("checkbox");
  expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("button", { name: "Delete field" }));
  expect(useAnnotations.getState().byDoc[DOC]).toEqual([]);
});
