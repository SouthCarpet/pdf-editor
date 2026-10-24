import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useAnnotations } from "@/stores/annotationsStore";
import { useDocuments } from "@/stores/documentStore";
import { useFilledFields } from "@/stores/filledFieldsStore";
import { useFormDrafts } from "@/stores/formDraftStore";
import { hasUnsavedWork } from "@/lib/unsavedWork";
import { parseAutosaveRecord, useDocumentAutosave } from "../autosave";

const commandStubs = vi.hoisted(() => ({ autosavePut: vi.fn() }));
vi.mock("@/bindings", () => ({ commands: commandStubs }));

beforeEach(() => {
  useAnnotations.setState({ byDoc: {} });
  useDocuments.setState({ documents: new Map(), activeDocId: null });
  useFilledFields.setState({ byDoc: {} });
  useFormDrafts.setState({ byDoc: {} });
  commandStubs.autosavePut.mockReset().mockResolvedValue({ status: "ok", data: null });
});

// Plan 119 §2.3 T6: same unsaved-work check as the close guard, real autosave hook.
it("T6 counts a pending own field as unsaved work and writes one form_field in the autosave record", async () => {
  const doc = "A:/docs/form.pdf";
  useAnnotations.getState().add(doc, {
    type: "form_field", page: 0, rect: [100, 650, 240, 672],
    name: "Meno", kind: "text", multiline: false, font_size: 0,
  });
  expect(hasUnsavedWork(doc)).toBe(true);
  const { unmount } = renderHook(() => useDocumentAutosave(doc));
  await act(async () => {});
  expect(commandStubs.autosavePut).toHaveBeenCalledTimes(1);
  const [path, json] = commandStubs.autosavePut.mock.calls[0] as [string, string];
  expect(path).toBe(doc);
  expect(parseAutosaveRecord(json)?.annotations).toEqual([{
    type: "form_field", page: 0, rect: [100, 650, 240, 672],
    name: "Meno", kind: "text", multiline: false, font_size: 0,
    __clientId: expect.any(String),
  }]);
  unmount();
});
