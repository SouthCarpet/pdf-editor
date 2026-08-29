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
import { useState, type RefObject } from "react";
import i18n from "i18next";
import "@/i18n";
import type { Annotation, DetectedFormField } from "@/bindings";
import { DetectedFieldFill } from "@/components/workspace/DetectedFieldFill";
import { EditFormsPanel } from "../EditFormsPanel";
import { useAnnotations } from "@/stores/annotationsStore";
import { useWorkspace } from "@/stores/workspaceStore";

type FreeText = Extract<Annotation, { type: "free_text" }>;

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
const applied: unknown[] = [];

const commandFakes = vi.hoisted(() => ({
  readFormFieldsCmd: vi.fn(),
  detectScannedFormFieldsCmd: vi.fn(),
  applyAnnotationsCmd: vi.fn(),
  autosavePut: vi.fn(),
}));
vi.mock("@/bindings", () => ({ commands: commandFakes }));
vi.mock("@/tauri/bridge", async () => (await import("@/test/fakeTauriBridge")).fakeBridge);

import { fakeBridge, resetFakeBridge } from "@/test/fakeTauriBridge";

/** The panel keeps detected fields in the workspace, so the test owns them.
 * `autoDetectHandledRef` mirrors the ref `Workspace` owns in the real app
 * (see `filledFieldsState.ts`'s sibling doc comment in `Workspace.tsx`): a
 * test that wants to prove the dedup survives a remount passes the SAME
 * ref object across two `render(<Harness />)` calls. */
function Harness({ autoDetectHandledRef }: { autoDetectHandledRef?: RefObject<number> }) {
  const [fields, setFields] = useState<DetectedFormField[] | null>(null);
  const addAnnotation = useAnnotations((state) => state.add);
  return (
    <>
      <EditFormsPanel
        docPath={DOC_PATH}
        detectedFields={fields}
        onDetectedFields={setFields}
        autoDetectHandledRef={autoDetectHandledRef}
      />
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
    vi.clearAllMocks();
    resetFakeBridge();
    fakeBridge.pickSavePath.mockResolvedValue(OUTPUT_PATH);
    commandFakes.readFormFieldsCmd.mockResolvedValue({ status: "ok", data: [] });
    commandFakes.detectScannedFormFieldsCmd.mockImplementation(async () => ({
      status: "ok",
      data: detected,
    }));
    commandFakes.applyAnnotationsCmd.mockImplementation(async (args: unknown) => {
      applied.push(args);
      return { status: "ok", data: null };
    });
    useAnnotations.setState({ byDoc: {}, mode: "highlight" });
    useWorkspace.setState({ autoDetectFormsRequest: 0 });
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
    const payload = applied[0] as {
      input: string;
      output: string;
      annotations: { type: string; rect: number[]; contents: string }[];
    };
    expect(payload.input).toBe(DOC_PATH);
    expect(payload.output).toBe(OUTPUT_PATH);
    expect(payload.annotations).toHaveLength(1);
    expect(payload.annotations[0].type).toBe("free_text");
    expect(payload.annotations[0].contents).toBe("Peter");
    expect(payload.annotations[0].rect).toEqual(BOX_FIELD.rect);
    expect(await screen.findByRole("status")).toHaveTextContent("Vyplnená kópia bola uložená.");
  });

  // Plan 050 task D2-UX (R5): the saved PDF must reflect exactly what the
  // live preview showed, including edits made after the field was filled -
  // the control strip edits the SAME store entry the save flow reads, so
  // there is no separate "preview" copy that could drift from "saved".
  it("saves the annotation with edits applied after it was filled, not the original", async () => {
    detected = [BOX_FIELD];
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(await screen.findByRole("button", { name: "Nájsť polia" }));
    await user.type(screen.getByPlaceholderText("Vyplňte pole"), "Peter");
    await user.click(screen.getByRole("button", { name: "Vložiť" }));

    const pending = useAnnotations.getState().byDoc[DOC_PATH][0] as FreeText & {
      __clientId: string;
    };
    useAnnotations.getState().update(DOC_PATH, pending.__clientId, {
      contents: "Peter Novák",
      rect: [100, 700, 260, 730],
      style: { ...pending.style, size_pt: 18, color: [1, 0, 0] },
    });

    await user.click(await screen.findByRole("button", { name: "Uložiť vyplnenú kópiu" }));

    await waitFor(() => expect(applied).toHaveLength(1));
    const payload = applied[0] as {
      annotations: {
        type: string;
        rect: number[];
        contents: string;
        style: { size_pt: number; color: number[] };
      }[];
    };
    expect(payload.annotations).toHaveLength(1);
    expect(payload.annotations[0].contents).toBe("Peter Novák");
    expect(payload.annotations[0].rect).toEqual([100, 700, 260, 730]);
    expect(payload.annotations[0].style.size_pt).toBe(18);
    expect(payload.annotations[0].style.color).toEqual([1, 0, 0]);
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

  // Plan 050 task D2-UX-2 (R7a): the Text tool's "Nájsť polia" increments a
  // workspace-store counter that this panel consumes once. The regression:
  // switching away from Forms and back remounted the panel with a fresh
  // local ref, so the still-nonzero counter looked new again and detection
  // ran a second time for the same click. The fix moved the dedup ref up
  // to `Workspace` (which does not unmount on a sub-tool switch); this test
  // reuses one ref object across two mounts the same way.
  it("consumes one auto-detect request once, even across a remount", async () => {
    detected = [BOX_FIELD];
    useWorkspace.getState().requestAutoDetectForms();
    const autoDetectHandledRef: RefObject<number> = { current: 0 };

    const { unmount } = render(<Harness autoDetectHandledRef={autoDetectHandledRef} />);
    await waitFor(() =>
      expect(commandFakes.detectScannedFormFieldsCmd).toHaveBeenCalledTimes(1)
    );

    // Simulate leaving the Forms sub-tool and coming back: the component
    // remounts, but the ref object passed back in (owned by the caller,
    // like `Workspace` in the real app) survives.
    unmount();
    render(<Harness autoDetectHandledRef={autoDetectHandledRef} />);

    // Give a stray effect a turn of the microtask/task queue before asserting
    // it never fired a second detect call.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(commandFakes.detectScannedFormFieldsCmd).toHaveBeenCalledTimes(1);
  });

  // The counterpart: a caller that does NOT thread a persistent ref through
  // (the panel's own fallback `useRef`) does not get the remount fix - it
  // only guarantees a single mount is deduped once, same as before R7a.
  it("without a shared ref, a genuinely fresh mount can still auto-detect", async () => {
    detected = [BOX_FIELD];
    useWorkspace.getState().requestAutoDetectForms();

    render(<Harness />);
    await waitFor(() =>
      expect(commandFakes.detectScannedFormFieldsCmd).toHaveBeenCalledTimes(1)
    );
  });
});
