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

describe("EditFormsPanel", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    resetFakeBridge();
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
});
