import { beforeEach, describe, expect, it, vi } from "vitest";
import { HISTORY_LIMIT, historyStore, type HistoryEntry } from "../historyStore";

const DOC_A = "A:\\docs\\a.pdf";
const DOC_B = "A:\\docs\\b.pdf";

function entry(label: string): HistoryEntry {
  return { label, undo: vi.fn(), redo: vi.fn() };
}

describe("historyStore", () => {
  beforeEach(() => {
    historyStore.setState({ byDoc: {} });
  });

  it("undo moves the newest entry to redo and runs its inverse", () => {
    const change = entry("text");
    historyStore.getState().push(DOC_A, change);

    historyStore.getState().undo(DOC_A);

    expect(change.undo).toHaveBeenCalledTimes(1);
    expect(historyStore.getState().canUndo(DOC_A)).toBe(false);
    expect(historyStore.getState().canRedo(DOC_A)).toBe(true);
  });

  it("redo reapplies the most recently undone entry", () => {
    const change = entry("move");
    historyStore.getState().push(DOC_A, change);
    historyStore.getState().undo(DOC_A);

    historyStore.getState().redo(DOC_A);

    expect(change.redo).toHaveBeenCalledTimes(1);
    expect(historyStore.getState().canUndo(DOC_A)).toBe(true);
    expect(historyStore.getState().canRedo(DOC_A)).toBe(false);
  });

  it("keeps only the newest 100 entries", () => {
    for (let index = 0; index <= HISTORY_LIMIT; index += 1) {
      historyStore.getState().push(DOC_A, entry(String(index)));
    }

    const undo = historyStore.getState().byDoc[DOC_A].undo;
    expect(undo).toHaveLength(100);
    expect(undo[0].label).toBe("1");
    expect(undo.at(-1)?.label).toBe("100");
  });

  it("a new push after undo discards the redo stack", () => {
    historyStore.getState().push(DOC_A, entry("text"));
    historyStore.getState().undo(DOC_A);

    historyStore.getState().push(DOC_A, entry("style"));

    expect(historyStore.getState().canRedo(DOC_A)).toBe(false);
    expect(historyStore.getState().byDoc[DOC_A].undo.at(-1)?.label).toBe("style");
  });

  it("isolates histories by document path", () => {
    const first = entry("first");
    const second = entry("second");
    historyStore.getState().push(DOC_A, first);
    historyStore.getState().push(DOC_B, second);

    historyStore.getState().undo(DOC_A);

    expect(first.undo).toHaveBeenCalledTimes(1);
    expect(second.undo).not.toHaveBeenCalled();
    expect(historyStore.getState().canUndo(DOC_B)).toBe(true);
  });

  it("clear removes both stacks for only the requested document", () => {
    historyStore.getState().push(DOC_A, entry("first"));
    historyStore.getState().push(DOC_B, entry("second"));
    historyStore.getState().undo(DOC_A);

    historyStore.getState().clear(DOC_A);

    expect(historyStore.getState().canUndo(DOC_A)).toBe(false);
    expect(historyStore.getState().canRedo(DOC_A)).toBe(false);
    expect(historyStore.getState().canUndo(DOC_B)).toBe(true);
  });
});
