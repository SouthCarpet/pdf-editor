// Plan 050 task D2-UX (R4, R5): the Text tool on a scanned page used to
// say "No editable text runs on this document" - true, but it never told
// the user why, or what to do about it. On a page with no text layer it
// now explains the scan and offers "Nájsť polia" (switch to Forms and run
// detection) and "Spustiť OCR" (the existing OCR entry point), while
// keeping the "add new text" button.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "@/i18n";
import { useAnnotations } from "@/stores/annotationsStore";
import { useDocuments } from "@/stores/documentStore";
import { useWorkspace } from "@/stores/workspaceStore";
import { hasUnsavedWork } from "@/lib/unsavedWork";
import { EditTextPanel } from "../EditTextPanel";

const DOC_PATH = "A:\\scans\\hodiny.pdf";

const mocks = vi.hoisted(() => ({
  extractRunsCmd: vi.fn(),
  detectScannedPdf: vi.fn(),
  autosavePut: vi.fn(),
  replaceRunCmd: vi.fn(),
}));

vi.mock("@/bindings", () => ({
  commands: {
    extractRunsCmd: mocks.extractRunsCmd,
    detectScannedPdf: mocks.detectScannedPdf,
    autosavePut: mocks.autosavePut,
    replaceRunCmd: mocks.replaceRunCmd,
  },
}));

vi.mock("@/tauri/bridge", async () => (await import("@/test/fakeTauriBridge")).fakeBridge);
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: vi.fn() }));

describe("EditTextPanel on a scanned page", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("sk");
    vi.clearAllMocks();
    useWorkspace.setState({
      editSubTool: "text",
      ocrPromptOpen: false,
      autoDetectFormsRequest: 0,
    });
    useAnnotations.setState({ byDoc: {}, mode: "highlight" });
    useDocuments.setState({ documents: new Map(), activeDocId: null });
    useDocuments.getState().add({ id: DOC_PATH, path: DOC_PATH, pageCount: 1, dirty: false });
    mocks.extractRunsCmd.mockResolvedValue({ status: "ok", data: [] });
  });

  it("explains the scan and offers Nájsť polia + Spustiť OCR, keeping the add-new-text button", async () => {
    mocks.detectScannedPdf.mockResolvedValue({
      status: "ok",
      data: { is_likely_scanned: true, avg_chars_per_page: 0, total_pages: 1 },
    });

    render(<EditTextPanel docPath={DOC_PATH} />);

    expect(await screen.findByText("Táto strana je naskenovaný obrázok")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nájsť polia" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Spustiť OCR" })).toBeInTheDocument();
    // R7c (plan 050 D2-UX-2): the button used the hardcoded English string
    // "Add new text…" instead of the existing `edit_text.add_new_text` key,
    // so a Slovak session saw untranslated English here.
    expect(screen.getByRole("button", { name: "Pridať nový text" })).toBeInTheDocument();
    // The plain "no text at all" message does not also show.
    expect(
      screen.queryByText("Na tejto strane sa nenašiel žiadny upraviteľný text."),
    ).not.toBeInTheDocument();
  });

  it("Nájsť polia switches to the Forms sub-tool and requests detection", async () => {
    mocks.detectScannedPdf.mockResolvedValue({
      status: "ok",
      data: { is_likely_scanned: true, avg_chars_per_page: 0, total_pages: 1 },
    });
    const user = userEvent.setup();
    render(<EditTextPanel docPath={DOC_PATH} />);

    await user.click(await screen.findByRole("button", { name: "Nájsť polia" }));

    expect(useWorkspace.getState().editSubTool).toBe("forms");
    expect(useWorkspace.getState().autoDetectFormsRequest).toBe(1);
  });

  it("Spustiť OCR opens the scanned-page OCR dialog", async () => {
    mocks.detectScannedPdf.mockResolvedValue({
      status: "ok",
      data: { is_likely_scanned: true, avg_chars_per_page: 0, total_pages: 1 },
    });
    const user = userEvent.setup();
    render(<EditTextPanel docPath={DOC_PATH} />);

    await user.click(await screen.findByRole("button", { name: "Spustiť OCR" }));

    expect(useWorkspace.getState().ocrPromptOpen).toBe(true);
  });

  it("shows the plain empty message, not the scan explanation, on a non-scanned page with no runs", async () => {
    mocks.detectScannedPdf.mockResolvedValue({
      status: "ok",
      data: { is_likely_scanned: false, avg_chars_per_page: 900, total_pages: 1 },
    });

    render(<EditTextPanel docPath={DOC_PATH} />);

    expect(
      await screen.findByText("Na tejto strane sa nenašiel žiadny upraviteľný text."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nájsť polia" })).not.toBeInTheDocument();
  });
});

// Plan 050 task D2-UX-2 (R1): an in-progress (not yet Applied) text-run
// edit is real unsaved work - `hasUnsavedWork` must see it, the same as a
// pending annotation, so the close guard warns instead of losing it
// silently.
describe("EditTextPanel text-draft dirty tracking", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("sk");
    vi.clearAllMocks();
    useWorkspace.setState({
      editSubTool: "text",
      ocrPromptOpen: false,
      autoDetectFormsRequest: 0,
    });
    useAnnotations.setState({ byDoc: {}, mode: "highlight" });
    useDocuments.setState({ documents: new Map(), activeDocId: null });
    useDocuments.getState().add({ id: DOC_PATH, path: DOC_PATH, pageCount: 1, dirty: false });
    mocks.detectScannedPdf.mockResolvedValue({
      status: "ok",
      data: { is_likely_scanned: false, avg_chars_per_page: 900, total_pages: 1 },
    });
    mocks.extractRunsCmd.mockResolvedValue({
      status: "ok",
      data: [
        {
          page: 0,
          text: "Hello",
          bbox: [0, 0, 10, 10],
          operator_index: 0,
          font: "Helvetica",
          font_size: 12,
        },
      ],
    });
  });

  it("marks the document dirty once the user edits a selected run, clean before that", async () => {
    const user = userEvent.setup();
    render(<EditTextPanel docPath={DOC_PATH} />);

    await user.click(await screen.findByText(/Hello/));
    expect(hasUnsavedWork(DOC_PATH)).toBe(false);

    const input = screen.getByDisplayValue("Hello");
    await user.clear(input);
    await user.type(input, "Ahoj");

    expect(hasUnsavedWork(DOC_PATH)).toBe(true);
  });

  it("clears the dirty flag once Apply succeeds", async () => {
    const { save } = await import("@tauri-apps/plugin-dialog");
    vi.mocked(save).mockResolvedValue("A:\\scans\\hodiny.edited.pdf");
    mocks.replaceRunCmd.mockResolvedValue({ status: "ok", data: null });

    const user = userEvent.setup();
    render(<EditTextPanel docPath={DOC_PATH} />);

    await user.click(await screen.findByText(/Hello/));
    const input = screen.getByDisplayValue("Hello");
    await user.clear(input);
    await user.type(input, "Ahoj");
    expect(hasUnsavedWork(DOC_PATH)).toBe(true);

    await user.click(screen.getByRole("button", { name: /Apply/i }));

    await vi.waitFor(() => expect(hasUnsavedWork(DOC_PATH)).toBe(false));
  });

  it("clears the dirty flag when the selection changes without applying", async () => {
    mocks.extractRunsCmd.mockResolvedValue({
      status: "ok",
      data: [
        { page: 0, text: "Hello", bbox: [0, 0, 10, 10], operator_index: 0, font: "H", font_size: 12 },
        { page: 0, text: "World", bbox: [0, 0, 10, 10], operator_index: 1, font: "H", font_size: 12 },
      ],
    });
    const user = userEvent.setup();
    render(<EditTextPanel docPath={DOC_PATH} />);

    await user.click(await screen.findByText(/Hello/));
    const input = screen.getByDisplayValue("Hello");
    await user.clear(input);
    await user.type(input, "Ahoj");
    expect(hasUnsavedWork(DOC_PATH)).toBe(true);

    await user.click(screen.getByText(/World/));
    expect(hasUnsavedWork(DOC_PATH)).toBe(false);
  });
});
