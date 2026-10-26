// Plan 119 p1c: a document can hold native AcroForm fields on some pages and
// plain printed boxes on others (a scan appended to a form). Detection used
// to be offered only when the whole document had no native field, so the
// printed boxes of such a document could not be filled.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import i18n from "@/i18n";
import type { DetectedFormField } from "@/bindings";
import { EditFormsPanel } from "../EditFormsPanel";
import { useAnnotations } from "@/stores/annotationsStore";
import { useDocuments } from "@/stores/documentStore";
import { useFormDrafts } from "@/stores/formDraftStore";
import { useWorkspace } from "@/stores/workspaceStore";

const DOC = "D:\\input\\hybrid.pdf";

const commandFakes = vi.hoisted(() => ({
  readFormFieldsCmd: vi.fn(),
  detectScannedFormFieldsCmd: vi.fn(),
  setFormValuesCmd: vi.fn(),
  autosavePut: vi.fn(),
}));
vi.mock("@/bindings", () => ({ commands: commandFakes }));
vi.mock("@/tauri/bridge", async () => (await import("@/test/fakeTauriBridge")).fakeBridge);

import { resetFakeBridge } from "@/test/fakeTauriBridge";

const NATIVE_FIELD = {
  id: "10:0",
  name: "Applicant",
  kind: "text",
  value: "Alice",
  page_index: 0,
  rect: [36, 700, 240, 724],
  options: [],
  read_only: false,
  required: false,
};

const SCANNED_BOX: DetectedFormField = {
  id: "1:0",
  page_index: 1,
  rect: [100, 500, 300, 530],
  kind: "box",
  confidence: 0.9,
};

function Harness() {
  const [fields, setFields] = useState<DetectedFormField[] | null>(null);
  return <EditFormsPanel docPath={DOC} detectedFields={fields} onDetectedFields={setFields} />;
}

describe("EditFormsPanel on a document with native fields and printed boxes", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    resetFakeBridge();
    await i18n.changeLanguage("en");
    useFormDrafts.setState({ byDoc: {} });
    useAnnotations.setState({ byDoc: {}, mode: "highlight" });
    useDocuments.setState({ documents: new Map(), activeDocId: null });
    useDocuments.getState().add({ id: DOC, path: DOC, pageCount: 2, dirty: false });
    useWorkspace.setState({ activePage: 0 });
    commandFakes.readFormFieldsCmd.mockResolvedValue({ status: "ok", data: [NATIVE_FIELD] });
    commandFakes.detectScannedFormFieldsCmd.mockResolvedValue({ status: "ok", data: [SCANNED_BOX] });
  });

  it("lists the native fields and still offers field detection", async () => {
    render(<Harness />);

    expect(await screen.findByDisplayValue("Alice")).toBeInTheDocument();
    expect(screen.getByText("Fields without a form widget")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Find fields" })).toBeInTheDocument();
  });

  it("detects on the page in view, here the page without widgets", async () => {
    useWorkspace.setState({ activePage: 1 });
    const user = userEvent.setup();
    render(<Harness />);
    await screen.findByDisplayValue("Alice");

    await user.click(screen.getByRole("button", { name: "Find fields" }));

    await waitFor(() =>
      expect(commandFakes.detectScannedFormFieldsCmd).toHaveBeenCalledWith(DOC, 1, 150),
    );
    expect(await screen.findByText("1 field found")).toBeInTheDocument();
  });

  it("keeps the native values editable beside the detected fields", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = await screen.findByDisplayValue("Alice");
    await user.click(screen.getByRole("button", { name: "Find fields" }));
    await screen.findByText("1 field found");

    await user.type(input, "!");

    expect(screen.getByDisplayValue("Alice!")).toBeInTheDocument();
    expect(screen.getByText("1 change")).toBeInTheDocument();
  });

  it("names the save button for both kinds of value once boxes are found", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await screen.findByDisplayValue("Alice");
    await user.click(screen.getByRole("button", { name: "Find fields" }));
    await screen.findByText("1 field found");

    expect(
      screen.getByRole("button", { name: "Save form values and detected fields" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Save filled copy" })).toHaveLength(1);
  });
});
