import { beforeEach, describe, expect, it } from "vitest";
import { historyStore } from "@/stores/historyStore";
import { CROP_HISTORY_LABEL, commitCropDragEnd, commitCropRectChange } from "../cropHistory";
import type { CropRect } from "../cropModel";

const DOC = "A:\\docs\\crop.pdf";
const START: CropRect = { x: 10, y: 20, width: 100, height: 80 };
const END: CropRect = { x: 30, y: 40, width: 120, height: 90 };

describe("commitCropRectChange", () => {
  beforeEach(() => {
    historyStore.setState({ byDoc: {} });
  });

  it("pushes one Orezanie entry and undo restores the previous rectangle", () => {
    let current = START;
    commitCropRectChange(DOC, START, END, (rect) => {
      current = rect;
    });

    expect(current).toEqual(END);
    const stack = historyStore.getState().byDoc[DOC].undo;
    expect(stack).toHaveLength(1);
    expect(stack[0].label).toBe(CROP_HISTORY_LABEL);
    expect(stack[0].label).toBe("Orezanie");

    historyStore.getState().undo(DOC);
    expect(current).toEqual(START);
    historyStore.getState().redo(DOC);
    expect(current).toEqual(END);
  });

  it("does not push when the rectangle did not change", () => {
    commitCropRectChange(DOC, START, { ...START }, () => {
      throw new Error("apply must not run");
    });
    expect(historyStore.getState().canUndo(DOC)).toBe(false);
  });
});

describe("commitCropDragEnd", () => {
  beforeEach(() => {
    historyStore.setState({ byDoc: {} });
  });

  it("records a single history entry for the whole drag, not per move", () => {
    let current = START;
    const apply = (rect: CropRect) => {
      current = rect;
    };
    apply({ x: 15, y: 20, width: 100, height: 80 });
    apply({ x: 22, y: 25, width: 100, height: 80 });
    commitCropDragEnd(DOC, START, END, apply);

    expect(historyStore.getState().byDoc[DOC].undo).toHaveLength(1);
    expect(historyStore.getState().byDoc[DOC].undo[0].label).toBe("Orezanie");
    historyStore.getState().undo(DOC);
    expect(current).toEqual(START);
  });
});
