import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "@/i18n";
import { EditFormsPanel } from "../EditFormsPanel";

const mocks = vi.hoisted(() => ({
  readFormFieldsCmd: vi.fn(),
  setFormValuesCmd: vi.fn(),
  autosavePut: vi.fn(),
}));

vi.mock("@/bindings", () => ({
  commands: {
    readFormFieldsCmd: mocks.readFormFieldsCmd,
    setFormValuesCmd: mocks.setFormValuesCmd,
    autosavePut: mocks.autosavePut,
  },
}));

vi.mock("@/tauri/bridge", async () => (await import("@/test/fakeTauriBridge")).fakeBridge);

import { fakeBridge, resetFakeBridge } from "@/test/fakeTauriBridge";
import { useFormDrafts } from "@/stores/formDraftStore";
import { useDocuments } from "@/stores/documentStore";

const ORIGINAL = "D:\\input\\form.pdf";
const SAVED = "D:\\output\\form.filled.pdf";

function applicant(value: string) {
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

describe("EditFormsPanel", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    resetFakeBridge();
    useFormDrafts.setState({ byDoc: {} });
    useDocuments.setState({ documents: new Map(), activeDocId: null });
    useDocuments.getState().add({ id: ORIGINAL, path: ORIGINAL, pageCount: 1, dirty: false });
    await i18n.changeLanguage("en");
    mocks.readFormFieldsCmd.mockResolvedValue({
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
    mocks.setFormValuesCmd.mockResolvedValue({ status: "ok", data: null });
    fakeBridge.pickSavePath.mockResolvedValue("D:\\output\\form.filled.pdf");
  });

  it("sends an explicit null update when a user clears a filled field", async () => {
    const user = userEvent.setup();
    render(<EditFormsPanel docPath={"D:\\input\\form.pdf"} />);

    expect(await screen.findByDisplayValue("Alice")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear value" }));
    expect(screen.getByLabelText(/Applicant/)).toHaveValue("");
    await user.click(screen.getByRole("button", { name: "Save filled copy" }));

    await waitFor(() =>
      expect(mocks.setFormValuesCmd).toHaveBeenCalledWith(
        expect.objectContaining({
          input: "D:\\input\\form.pdf",
          output: "D:\\output\\form.filled.pdf",
          updates: [{ field_id: "10:0", value: null }],
        })
      )
    );
  });

  // Plan 050 task D2: the empty state used to send the user to OCR, which
  // finds printed words, not the blank boxes they want to fill. It now
  // offers geometry detection instead.
  it("offers field detection when no AcroForm fields exist", async () => {
    mocks.readFormFieldsCmd.mockResolvedValue({ status: "ok", data: [] });

    render(<EditFormsPanel docPath={"D:\\input\\scan.pdf"} />);

    expect(await screen.findByText("No native form fields found")).toBeInTheDocument();
    expect(screen.getByText(/empty boxes and lines in the page image/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Find fields" })).toBeInTheDocument();
  });

  // Plan 119 p1: switching the Edit sub-tool unmounts this panel. Typed
  // values lived in its local state and were lost on the way to Text and
  // back.
  it("keeps typed values when the panel unmounts and mounts again", async () => {
    const user = userEvent.setup();
    const first = render(<EditFormsPanel docPath={"D:\\input\\form.pdf"} />);
    const input = await screen.findByDisplayValue("Alice");
    await user.clear(input);
    await user.type(input, "Ľubica Šťastná");
    first.unmount();

    render(<EditFormsPanel docPath={"D:\\input\\form.pdf"} />);

    expect(await screen.findByDisplayValue("Ľubica Šťastná")).toBeInTheDocument();
    expect(screen.getByText("1 change")).toBeInTheDocument();
  });

  it("a second save sends every value that differs from the saved copy", async () => {
    const field = (id: string, name: string, value: string, y: number) => ({
      id, name, kind: "text", value, page_index: 0,
      rect: [36, y, 240, y + 24], options: [], read_only: false, required: false,
    });
    mocks.readFormFieldsCmd.mockImplementation(async (path: string) => ({
      status: "ok",
      data: [
        field("1:0", "First", path === SAVED ? "one" : "", 700),
        field("2:0", "Second", "", 650),
      ],
    }));
    const user = userEvent.setup();
    render(<EditFormsPanel docPath={ORIGINAL} />);
    await user.type(await screen.findByLabelText(/First/), "one");
    await user.click(screen.getByRole("button", { name: "Save filled copy" }));
    await waitFor(() => expect(mocks.readFormFieldsCmd).toHaveBeenLastCalledWith(SAVED));

    await user.type(screen.getByLabelText(/Second/), "two");
    await user.click(screen.getByRole("button", { name: "Save filled copy" }));

    await waitFor(() => expect(mocks.setFormValuesCmd).toHaveBeenCalledTimes(2));
    expect(mocks.setFormValuesCmd).toHaveBeenLastCalledWith(
      expect.objectContaining({
        input: SAVED,
        output: SAVED,
        updates: [{ field_id: "2:0", value: "two" }],
      }),
    );
  });

  // Plan 119 p1b defect 3: the AcroForm save always wrote a new copy of the
  // original, and the page view kept showing the original. It now follows
  // the FreeText save: start from the latest saved copy, show it after the
  // save, keep the values on screen.
  it("saves on top of the latest saved copy and shows that copy", async () => {
    mocks.readFormFieldsCmd.mockImplementation(async (path: string) => ({
      status: "ok",
      data: [applicant(path === SAVED ? "Bob" : "Alice")],
    }));
    const user = userEvent.setup();
    render(<EditFormsPanel docPath={ORIGINAL} />);
    const input = await screen.findByDisplayValue("Alice");
    await user.clear(input);
    await user.type(input, "Bob");
    await user.click(screen.getByRole("button", { name: "Save filled copy" }));

    await waitFor(() => expect(mocks.readFormFieldsCmd).toHaveBeenLastCalledWith(SAVED));
    expect(mocks.setFormValuesCmd).toHaveBeenCalledWith(
      expect.objectContaining({ input: ORIGINAL, output: SAVED }),
    );
    const document = useDocuments.getState().documents.get(ORIGINAL);
    expect(document?.savedPath).toBe(SAVED);
    expect(document?.savedRevision).toBe(1);
    expect(screen.getByLabelText(/Applicant/)).toHaveValue("Bob");
    expect(screen.queryByText("1 change")).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText(/Applicant/));
    await user.type(screen.getByLabelText(/Applicant/), "Carol");
    await user.click(screen.getByRole("button", { name: "Save filled copy" }));

    await waitFor(() => expect(mocks.setFormValuesCmd).toHaveBeenCalledTimes(2));
    expect(fakeBridge.pickSavePath).toHaveBeenCalledTimes(1);
    expect(mocks.setFormValuesCmd).toHaveBeenLastCalledWith(
      expect.objectContaining({
        input: SAVED,
        output: SAVED,
        updates: [{ field_id: "10:0", value: "Carol" }],
      }),
    );
  });

  // Plan 119 p1b defect 2 for AcroForm values: a value typed while the save
  // writes is not in the file, so it stays unsaved.
  it("keeps a value typed during the save unsaved", async () => {
    let finishWrite: () => void = () => {};
    mocks.setFormValuesCmd.mockImplementation(
      () => new Promise((resolve) => (finishWrite = () => resolve({ status: "ok", data: null }))),
    );
    const user = userEvent.setup();
    render(<EditFormsPanel docPath={ORIGINAL} />);
    const input = await screen.findByDisplayValue("Alice");
    await user.type(input, "!");
    await user.click(screen.getByRole("button", { name: "Save filled copy" }));
    await waitFor(() => expect(mocks.setFormValuesCmd).toHaveBeenCalledTimes(1));

    useFormDrafts.getState().setValue(ORIGINAL, "10:0", "Alice!?");
    finishWrite();

    await waitFor(() => expect(useDocuments.getState().documents.get(ORIGINAL)?.savedPath).toBe(SAVED));
    expect(useFormDrafts.getState().byDoc[ORIGINAL]?.saved).toEqual({ "10:0": "Alice!" });
    expect(await screen.findByText("1 change")).toBeInTheDocument();
  });
});
