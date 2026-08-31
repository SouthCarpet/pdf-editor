// Plan 062 T4.3: autosave of pending fills and crash recovery.
//
// Pure scheduler / serialiser / recovery-decision tests plus a store-level
// restore. The Tauri commands are mocked the same way
// `WorkspaceRoute.ocrFlow.test.tsx` mocks them (typedError `{status,data}`).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { Annotation } from "@/bindings";
import { useAnnotations, type ClientAnnotation } from "@/stores/annotationsStore";
import { useDocuments } from "@/stores/documentStore";
import { historyStore } from "@/stores/historyStore";
import { useAppStore } from "@/stores/appStore";
import { useFilledFields } from "@/stores/filledFieldsStore";
import { resetFakeBridge } from "@/test/fakeTauriBridge";

const DOC = "A:\\scans\\hodiny.pdf";

type FreeText = Extract<Annotation, { type: "free_text" }>;

function freeText(overrides: Partial<FreeText> = {}): FreeText {
  return {
    type: "free_text",
    page: 0,
    rect: [100, 700, 250, 724],
    contents: "Peter",
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
    ...overrides,
  };
}

function pending(clientId: string, contents = "Peter"): ClientAnnotation {
  return { ...freeText({ contents }), __clientId: clientId };
}

const commandFakes = vi.hoisted(() => ({
  autosavePut: vi.fn(),
  autosaveGet: vi.fn(),
  autosaveDelete: vi.fn(),
}));
vi.mock("@/bindings", () => ({ commands: commandFakes }));
vi.mock("@/tauri/bridge", async () => (await import("@/test/fakeTauriBridge")).fakeBridge);

import {
  autosaveScheduler,
  parseAutosaveRecord,
  restoreAutosaveRecord,
  serializePendingState,
  shouldOfferRecovery,
  useDocumentAutosave,
  DEFAULT_AUTOSAVE_INTERVAL_SEC,
  type AutosaveRecord,
} from "../autosave";

const INTERVAL_MS = DEFAULT_AUTOSAVE_INTERVAL_SEC * 1000;

describe("autosaveScheduler", () => {
  it("does not write when the document is not dirty", () => {
    expect(autosaveScheduler(20_000, 0, false, INTERVAL_MS)).toBe(false);
    expect(autosaveScheduler(20_000, 0, false, INTERVAL_MS, true)).toBe(false);
  });

  it("does not write when dirty but the interval has not elapsed", () => {
    expect(autosaveScheduler(5_000, 0, true, INTERVAL_MS)).toBe(false);
    expect(autosaveScheduler(9_999, 0, true, INTERVAL_MS)).toBe(false);
  });

  it("writes when dirty and the interval has elapsed (including first write)", () => {
    expect(autosaveScheduler(10_000, 0, true, INTERVAL_MS)).toBe(true);
    expect(autosaveScheduler(1_000, null, true, INTERVAL_MS)).toBe(true);
  });

  it("blur forces a write while dirty even before the interval", () => {
    expect(autosaveScheduler(1_000, 0, true, INTERVAL_MS, true)).toBe(true);
  });
});

describe("serialiser round trip", () => {
  it("restores annotations and filled marks with the same clientIds", () => {
    const annotations = [pending("client-keep", "Meno")];
    const filledMarks = {
      key: `${DOC}\u00000`,
      ids: ["0:0"],
      fieldIdByClientId: { "client-keep": "0:0" },
    };
    const savedAt = 1_700_000_000_000;
    const json = JSON.stringify(serializePendingState(annotations, filledMarks, savedAt));
    const parsed = parseAutosaveRecord(json);
    expect(parsed).not.toBeNull();
    expect(parsed?.v).toBe(1);
    expect(parsed?.savedAt).toBe(savedAt);
    expect(parsed?.annotations).toHaveLength(1);
    expect(parsed?.annotations[0].__clientId).toBe("client-keep");
    expect(parsed?.annotations[0].type).toBe("free_text");
    expect((parsed?.annotations[0] as ClientAnnotation & FreeText).contents).toBe("Meno");
    expect(parsed?.filledMarks.ids).toEqual(["0:0"]);
    expect(parsed?.filledMarks.fieldIdByClientId["client-keep"]).toBe("0:0");
  });

  it("rejects a payload that is not a v1 record", () => {
    expect(parseAutosaveRecord("[]")).toBeNull();
    expect(parseAutosaveRecord(JSON.stringify({ tool: "forms", values: {} }))).toBeNull();
    expect(parseAutosaveRecord("{")).toBeNull();
  });
});

describe("shouldOfferRecovery", () => {
  const record: AutosaveRecord = serializePendingState(
    [pending("c1")],
    { key: `${DOC}\u00000`, ids: ["0:0"], fieldIdByClientId: { c1: "0:0" } },
    1_000,
  );

  it("offers any record when file mtime is unavailable", () => {
    expect(shouldOfferRecovery(record, null)).toBe(true);
  });

  it("offers a record newer than the file mtime", () => {
    expect(shouldOfferRecovery(record, 500)).toBe(true);
  });

  it("does not offer a record older than or equal to the file mtime", () => {
    expect(shouldOfferRecovery(record, 1_000)).toBe(false);
    expect(shouldOfferRecovery(record, 2_000)).toBe(false);
  });

  it("does not offer when there is no record", () => {
    expect(shouldOfferRecovery(null, null)).toBe(false);
    expect(shouldOfferRecovery(null, 500)).toBe(false);
  });
});

describe("store-level restore", () => {
  beforeEach(() => {
    useAnnotations.setState({ byDoc: {}, mode: "highlight" });
    historyStore.setState({ byDoc: {} });
    useFilledFields.setState({ byDoc: {} });
    useDocuments.setState({ documents: new Map(), activeDocId: null });
    useDocuments.getState().add({ id: DOC, path: DOC, pageCount: 1, dirty: false });
  });

  it("restores the same clientIds, filled marks, empty undo history, and dirty", () => {
    historyStore.getState().push(DOC, { label: "stale", undo: () => {}, redo: () => {} });

    const record = serializePendingState(
      [pending("client-keep", "Hodiny")],
      {
        key: `${DOC}\u00000`,
        ids: ["0:0"],
        fieldIdByClientId: { "client-keep": "0:0" },
      },
      1_700_000_000_000,
    );

    restoreAutosaveRecord(DOC, record);

    const restored = useAnnotations.getState().byDoc[DOC];
    expect(restored).toHaveLength(1);
    expect(restored[0].__clientId).toBe("client-keep");
    expect((restored[0] as ClientAnnotation & FreeText).contents).toBe("Hodiny");

    const marks = useFilledFields.getState().byDoc[DOC];
    expect(marks.ids.has("0:0")).toBe(true);
    expect(marks.fieldIdByClientId["client-keep"]).toBe("0:0");

    expect(historyStore.getState().canUndo(DOC)).toBe(false);
    expect(historyStore.getState().canRedo(DOC)).toBe(false);
    expect(useDocuments.getState().documents.get(DOC)?.dirty).toBe(true);
  });

  it("relinks a restored fill so Delete unmarks its field (F5 regression)", () => {
    // Before the fix, `restoreAutosaveRecord` cleared the annotation-field
    // links and never rebuilt them, so Delete on a restored fill left the
    // detected-field overlay showing it as filled forever.
    const record = serializePendingState(
      [pending("client-keep", "Hodiny")],
      {
        key: `${DOC}\u00000`,
        ids: ["0:0"],
        fieldIdByClientId: { "client-keep": "0:0" },
      },
      1_700_000_000_000,
    );

    restoreAutosaveRecord(DOC, record);
    expect(useFilledFields.getState().byDoc[DOC].ids.has("0:0")).toBe(true);

    useAnnotations.getState().remove(DOC, "client-keep");

    expect(useFilledFields.getState().byDoc[DOC].ids.has("0:0")).toBe(false);
    expect(useFilledFields.getState().byDoc[DOC].fieldIdByClientId["client-keep"]).toBeUndefined();
  });

  it("restores fills spanning two pages, and each relinks to its own field (F5 regression)", () => {
    // `markFieldFilled` used to wipe every other page's marks on a page
    // switch, so a multi-page fill only ever autosaved the last page's
    // overlay. Both pages' marks must come back from one record.
    const record = serializePendingState(
      [pending("client-p0", "Prvá"), pending("client-p1", "Druhá")],
      {
        key: `${DOC}\u00001`,
        ids: ["0:0", "1:0"],
        fieldIdByClientId: { "client-p0": "0:0", "client-p1": "1:0" },
      },
      1_700_000_000_000,
    );

    restoreAutosaveRecord(DOC, record);
    expect(useFilledFields.getState().byDoc[DOC].ids.has("0:0")).toBe(true);
    expect(useFilledFields.getState().byDoc[DOC].ids.has("1:0")).toBe(true);
    expect(useFilledFields.getState().byDoc[DOC].fieldIdByClientId).toEqual({
      "client-p0": "0:0",
      "client-p1": "1:0",
    });

    // Delete the page-1 field: relinking rebuilt its link against page 1,
    // matching the store's currently tracked page, so it unmarks. (A
    // cross-page unmark, page 0 while page 1 is the tracked key, is a
    // separate, pre-existing limit of the single-key store shared with the
    // live fill flow - not part of this fix.)
    useAnnotations.getState().remove(DOC, "client-p1");
    expect(useFilledFields.getState().byDoc[DOC].ids.has("1:0")).toBe(false);
    expect(useFilledFields.getState().byDoc[DOC].ids.has("0:0")).toBe(true);
  });
});

describe("useDocumentAutosave (Tauri commands mocked)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetFakeBridge();
    commandFakes.autosavePut.mockResolvedValue({ status: "ok", data: null });
    commandFakes.autosaveGet.mockResolvedValue({ status: "ok", data: null });
    commandFakes.autosaveDelete.mockResolvedValue({ status: "ok", data: null });
    useAnnotations.setState({ byDoc: {}, mode: "highlight" });
    historyStore.setState({ byDoc: {} });
    useFilledFields.setState({ byDoc: {} });
    useDocuments.setState({ documents: new Map(), activeDocId: null });
    useDocuments.getState().add({ id: DOC, path: DOC, pageCount: 1, dirty: false });
    useAppStore.setState({ autosaveIntervalSec: DEFAULT_AUTOSAVE_INTERVAL_SEC });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("writes nothing while the document is not dirty, including on blur", async () => {
    renderHook(() => useDocumentAutosave(DOC));
    await act(async () => {
      window.dispatchEvent(new Event("blur"));
    });
    expect(commandFakes.autosavePut).not.toHaveBeenCalled();
  });

  it("writes immediately on blur while dirty", async () => {
    useAnnotations.getState().add(DOC, freeText({ contents: "bunka" }));
    renderHook(() => useDocumentAutosave(DOC));
    await vi.waitFor(() => expect(commandFakes.autosavePut).toHaveBeenCalled());
    await act(async () => {});
    commandFakes.autosavePut.mockClear();

    await act(async () => {
      window.dispatchEvent(new Event("blur"));
    });

    await vi.waitFor(() => expect(commandFakes.autosavePut).toHaveBeenCalledTimes(1));
    const [, json] = commandFakes.autosavePut.mock.calls[0] as [string, string];
    const parsed = parseAutosaveRecord(json);
    expect(parsed?.annotations[0].type).toBe("free_text");
    expect((parsed?.annotations[0] as ClientAnnotation & FreeText).contents).toBe("bunka");
    expect(parsed?.annotations[0].__clientId).toBe(
      useAnnotations.getState().byDoc[DOC][0].__clientId,
    );
  });

  it("writes on visibilitychange when the document becomes hidden", async () => {
    useAnnotations.getState().add(DOC, freeText());
    renderHook(() => useDocumentAutosave(DOC));
    await vi.waitFor(() => expect(commandFakes.autosavePut).toHaveBeenCalled());
    await act(async () => {});
    commandFakes.autosavePut.mockClear();

    await act(async () => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "hidden",
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await vi.waitFor(() => expect(commandFakes.autosavePut).toHaveBeenCalled());
  });
});
