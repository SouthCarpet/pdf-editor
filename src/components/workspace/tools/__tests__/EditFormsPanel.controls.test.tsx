import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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

import { resetFakeBridge } from "@/test/fakeTauriBridge";
import { useFormDrafts } from "@/stores/formDraftStore";
import { useDocuments } from "@/stores/documentStore";

const DOC = "D:\\input\\controls.pdf";

function field(overrides: Record<string, unknown>) {
  return {
    id: "1:0",
    name: "Field",
    kind: "text",
    value: null,
    page_index: 0,
    rect: [0, 0, 10, 10],
    options: [],
    read_only: false,
    required: false,
    ...overrides,
  };
}

async function renderWith(fields: unknown[]) {
  mocks.readFormFieldsCmd.mockResolvedValue({ status: "ok", data: fields });
  render(<EditFormsPanel docPath={DOC} />);
  await screen.findAllByText("Field");
}

describe("EditFormsPanel field controls", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    resetFakeBridge();
    useFormDrafts.setState({ byDoc: {} });
    useDocuments.setState({ documents: new Map(), activeDocId: null });
    useDocuments.getState().add({ id: DOC, path: DOC, pageCount: 1, dirty: false });
    await i18n.changeLanguage("en");
    mocks.autosavePut.mockResolvedValue({ status: "ok", data: null });
  });

  it("reads the value Off as an unchecked box and any other value as checked", async () => {
    await renderWith([
      field({ id: "1:0", name: "Field", kind: "checkbox", value: "Off", options: ["Yes"] }),
      field({ id: "2:0", name: "Field", kind: "checkbox", value: "Yes", options: ["Yes"] }),
    ]);
    const [off, on] = screen.getAllByRole("checkbox");
    expect(off).not.toBeChecked();
    expect(on).toBeChecked();
    expect(screen.getByText("Checked")).toBeInTheDocument();
  });

  it("checks a box with the first option of the field", async () => {
    const user = userEvent.setup();
    await renderWith([
      field({ kind: "checkbox", value: null, options: ["Agree"] }),
    ]);
    await user.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("checkbox")).toBeChecked();
    expect(useFormDrafts.getState().byDoc[DOC].values["1:0"]).toBe("Agree");
  });

  it("lists a value that is not among the options as the first option", async () => {
    await renderWith([
      field({ kind: "choice", value: "Other", options: ["A", "B"] }),
    ]);
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["No value", "Other", "A", "B"]);
  });

  it("does not repeat a value that is already among the options", async () => {
    await renderWith([field({ kind: "radio", value: "A", options: ["A", "B"] })]);
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["No value", "A", "B"]);
    expect(screen.getByRole("combobox")).toHaveValue("A");
  });

  it("disables the control of a read-only field", async () => {
    await renderWith([field({ kind: "text", value: "x", read_only: true })]);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });
});
