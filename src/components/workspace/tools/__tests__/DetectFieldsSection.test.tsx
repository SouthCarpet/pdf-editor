// Plan 050 task D2: the Forms panel on a scanned document.
//
// The defect: a scan has no AcroForm, so the panel only told the user to
// run OCR. These tests cover the replacement flow with the Tauri layer
// mocked, following `WorkspaceRoute.updateDepth.test.tsx`: detect fields,
// fill one, save one copy; and the honest empty answer when the page has
// no blank fields.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import i18n from "i18next";
import "@/i18n";
import type { DetectedFormField } from "@/bindings";
import { DetectedFieldFill } from "@/components/workspace/DetectedFieldFill";
import { EditFormsPanel } from "../EditFormsPanel";
import { useAnnotations } from "@/stores/annotationsStore";

const SEPARATOR = String.fromCharCode(92);
const DOC_PATH = ["A:", "scans", "hodiny.pdf"].join(SEPARATOR);
const OUTPUT_PATH = ["A:", "scans", "hodiny.filled.pdf"].join(SEPARATOR);

const BOX_FIELD: DetectedFormField = {
  id: "0:0",
  page_index: 0,
  rect: [100, 700, 250, 724],
  kind: "box",
  confidence: 0.9,
};
const UNDERLINE_FIELD: DetectedFormField = {
  id: "0:1",
  page_index: 0,
  rect: [100, 640, 300, 660],
  kind: "underline",
  confidence: 0.6,
};

let detected: DetectedFormField[] = [];
const invoke = vi.fn(async (command: string, args?: unknown) => {
  switch (command) {
    // No AcroForm: this is what makes the panel show the detect section.
    case "read_form_fields_cmd":
      return [];
    case "detect_scanned_form_fields_cmd":
      return detected;
    case "apply_annotations_cmd":
      applied.push(args);
      return null;
    default:
      return [];
  }
});
const applied: unknown[] = [];

vi.mock("@tauri-apps/api/core", () => ({
  Channel: class {},
  invoke: (command: string, args?: unknown) => invoke(command, args),
}));
vi.mock("@/tauri/bridge", async () => {
  const actual = await vi.importActual<typeof import("@/tauri/bridge")>("@/tauri/bridge");
  return { ...actual, pickSavePath: vi.fn(async () => OUTPUT_PATH) };
});

/** The panel keeps detected fields in the workspace, so the test owns them. */
function Harness() {
  const [fields, setFields] = useState<DetectedFormField[] | null>(null);
  const addAnnotation = useAnnotations((state) => state.add);
  return (
    <>
      <EditFormsPanel docPath={DOC_PATH} detectedFields={fields} onDetectedFields={setFields} />
      {fields?.[0] && (
        <DetectedFieldFill
          field={fields[0]}
          screenRect={{ x: 0, y: 0, width: 150, height: 24 }}
          onSubmit={(annotation) => addAnnotation(DOC_PATH, annotation)}
          onCancel={() => {}}
        />
      )}
    </>
  );
}

describe("forms panel on a scanned page", () => {
  beforeEach(async () => {
    // The UI copy for this flow is Slovak; jsdom would otherwise fall back
    // to English and the Slovak keys would never be exercised.
    await i18n.changeLanguage("sk");
    detected = [];
    applied.length = 0;
    invoke.mockClear();
    useAnnotations.setState({ byDoc: {}, mode: "highlight" });
    Object.assign(globalThis.crypto, { randomUUID: () => "00000000-0000-4000-8000-000000000000" });
  });

  it("detects fields, and saves a filled copy whose FreeText keeps the detected rect", async () => {
    detected = [BOX_FIELD, UNDERLINE_FIELD];
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(await screen.findByRole("button", { name: "Nájsť polia" }));
    expect(await screen.findByText("2 nájdené polia")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Vyplňte pole"), "Peter");
    await user.click(screen.getByRole("button", { name: "Vložiť" }));

    await user.click(await screen.findByRole("button", { name: "Uložiť vyplnenú kópiu" }));

    await waitFor(() => expect(applied).toHaveLength(1));
    // The generated binding wraps the struct argument in `{ args }`.
    const { args: payload } = applied[0] as {
      args: {
        input: string;
        output: string;
        annotations: { type: string; rect: number[]; contents: string }[];
      };
    };
    expect(payload.input).toBe(DOC_PATH);
    expect(payload.output).toBe(OUTPUT_PATH);
    expect(payload.annotations).toHaveLength(1);
    expect(payload.annotations[0].type).toBe("free_text");
    expect(payload.annotations[0].contents).toBe("Peter");
    expect(payload.annotations[0].rect).toEqual(BOX_FIELD.rect);
    expect(await screen.findByRole("status")).toHaveTextContent("Vyplnená kópia bola uložená.");
  });

  it("says nothing was found instead of pretending, when the page has no blank fields", async () => {
    detected = [];
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(await screen.findByRole("button", { name: "Nájsť polia" }));

    expect(
      await screen.findByText("Na tejto strane sa nenašli žiadne prázdne polia.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Uložiť vyplnenú kópiu" })).toBeNull();
  });
});
