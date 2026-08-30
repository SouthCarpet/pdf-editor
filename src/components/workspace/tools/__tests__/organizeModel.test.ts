import { beforeEach, describe, expect, it } from "vitest";
import { historyStore } from "@/stores/historyStore";
import {
  buildApplyPlan,
  createOrganizeState,
  deleteSelected,
  dragGroupIds,
  duplicate,
  insertBlankAfter,
  insertFrom,
  mergeImportSplit,
  movePages,
  reverse,
  rotatePage,
  selectOne,
  selectRange,
  toggleDeleted,
  toggleSelect,
  type ApplyPlan,
  type OrganizeState,
} from "../organizeModel";

const DOC = "A:\\docs\\order.pdf";

function ids(state: OrganizeState): string[] {
  return state.pages.map((page) => page.id);
}

function originals(state: OrganizeState): Array<number | null> {
  return state.pages.map((page) => page.originalIndex);
}

function commit(before: OrganizeState, after: OrganizeState, apply: (next: OrganizeState) => void) {
  apply(after);
  historyStore.getState().push(DOC, {
    label: "organize",
    undo: () => apply(before),
    redo: () => apply(after),
  });
}

function pageCountFromStages(plan: ApplyPlan): number {
  let count = 0;
  let pendingImport = 0;
  for (const stage of plan.stages) {
    if (stage.type === "reorder") count = stage.new_order.length;
    if (stage.type === "insert_blank") count += 1;
    if (stage.type === "extract_import") pendingImport = stage.pages.length;
    if (stage.type === "merge_import") {
      count += pendingImport;
      pendingImport = 0;
    }
  }
  return count;
}

describe("createOrganizeState", () => {
  it("assigns stable ids and 0-based originalIndex for each source page", () => {
    const state = createOrganizeState(3);

    expect(ids(state)).toEqual(["p0", "p1", "p2"]);
    expect(originals(state)).toEqual([0, 1, 2]);
    expect(state.pages.every((page) => page.duplicate === false)).toBe(true);
    expect(state.selectedIds).toEqual([]);
    expect(state.anchorId).toBeNull();
  });
});

describe("movePages", () => {
  it("moves a single page so the block occupies the drop slot after removal", () => {
    const state = createOrganizeState(4);

    const moved = movePages(state, ["p0"], 2);

    expect(ids(moved)).toEqual(["p1", "p0", "p2", "p3"]);
    expect(moved).not.toBe(state);
  });

  it("drops a non-contiguous group as a block and keeps their relative order", () => {
    // Oracle: pages 2 and 4 (ids p1, p3) dragged onto the first slot stay 2-then-4.
    const state = createOrganizeState(5);

    const moved = movePages(state, ["p3", "p1"], 0);

    expect(ids(moved)).toEqual(["p1", "p3", "p0", "p2", "p4"]);
    expect(originals(moved)).toEqual([1, 3, 0, 2, 4]);
  });

  it("inserts the block at a mid-list drop after removing the movers", () => {
    const state = createOrganizeState(5);

    const moved = movePages(state, ["p1", "p3"], 4);

    expect(ids(moved)).toEqual(["p0", "p2", "p1", "p3", "p4"]);
  });

  it("returns the same state when no ids match", () => {
    const state = createOrganizeState(2);

    expect(movePages(state, ["missing"], 0)).toBe(state);
  });
});

describe("reverse", () => {
  it("reverses the full page list without mutating the input", () => {
    const state = createOrganizeState(3);

    const reversed = reverse(state);

    expect(ids(reversed)).toEqual(["p2", "p1", "p0"]);
    expect(ids(state)).toEqual(["p0", "p1", "p2"]);
  });
});

describe("duplicate", () => {
  it("inserts a copy immediately after the original, marked as a duplicate of originalIndex", () => {
    const state = createOrganizeState(2);

    const next = duplicate(state, "p0");

    expect(next.pages).toHaveLength(3);
    expect(next.pages[0]?.id).toBe("p0");
    expect(next.pages[1]?.originalIndex).toBe(0);
    expect(next.pages[1]?.duplicate).toBe(true);
    expect(next.pages[1]?.id).not.toBe("p0");
    expect(next.pages[2]?.id).toBe("p1");
  });

  it("returns the same state when the id is unknown", () => {
    const state = createOrganizeState(1);
    expect(duplicate(state, "nope")).toBe(state);
  });
});

describe("insertFrom", () => {
  it("inserts imported entries after the given index and assigns new ids", () => {
    const state = createOrganizeState(2);

    const next = insertFrom(state, 0, [
      { imported: { path: "A:\\other.pdf", page: 0 } },
      { imported: { path: "A:\\other.pdf", page: 2 } },
    ]);

    expect(next.pages).toHaveLength(4);
    expect(next.pages[1]?.imported).toEqual({ path: "A:\\other.pdf", page: 0 });
    expect(next.pages[2]?.imported).toEqual({ path: "A:\\other.pdf", page: 2 });
    expect(next.pages[1]?.originalIndex).toBeNull();
    expect(next.pages[3]?.id).toBe("p1");
  });
});

describe("selection rules", () => {
  it("plain selectOne keeps only the clicked page and sets the anchor", () => {
    const state = toggleSelect(createOrganizeState(4), "p0");

    const next = selectOne(state, "p2");

    expect(next.selectedIds).toEqual(["p2"]);
    expect(next.anchorId).toBe("p2");
  });

  it("Shift range selects every page from the anchor through the clicked id", () => {
    const anchored = selectOne(createOrganizeState(5), "p1");

    const ranged = selectRange(anchored, anchored.anchorId ?? "p1", "p4");

    expect(ranged.selectedIds).toEqual(["p1", "p2", "p3", "p4"]);
    expect(ranged.anchorId).toBe("p1");
  });

  it("Shift range works backwards and stays inclusive", () => {
    const anchored = selectOne(createOrganizeState(5), "p3");

    const ranged = selectRange(anchored, "p3", "p0");

    expect(ranged.selectedIds).toEqual(["p0", "p1", "p2", "p3"]);
  });

  it("Ctrl toggle adds and then removes a page without dropping the rest", () => {
    const first = toggleSelect(createOrganizeState(3), "p0");
    const added = toggleSelect(first, "p2");
    const removed = toggleSelect(added, "p0");

    expect(first.selectedIds).toEqual(["p0"]);
    expect(added.selectedIds).toEqual(["p0", "p2"]);
    expect(removed.selectedIds).toEqual(["p2"]);
    expect(removed.anchorId).toBe("p0");
  });
});

describe("dragGroupIds", () => {
  it("drags the selected block when the grabbed page is selected", () => {
    const selected = selectRange(selectOne(createOrganizeState(4), "p0"), "p0", "p2");

    expect(dragGroupIds(selected, "p1")).toEqual(["p0", "p1", "p2"]);
  });

  it("drags only the grabbed page when it is not in the selection", () => {
    const selected = selectOne(createOrganizeState(4), "p0");

    expect(dragGroupIds(selected, "p2")).toEqual(["p2"]);
  });
});

describe("buildApplyPlan", () => {
  it("orders reorder, import extract/merge, blanks, then rotate, and matches kept page count", () => {
    // 3-page doc: duplicate page 1, import two pages after the copy, blank at end,
    // delete original page 3, rotate original page 2 by 90.
    let state = duplicate(createOrganizeState(3), "p0");
    state = insertFrom(state, 1, [
      { imported: { path: "A:\\other.pdf", page: 0 } },
      { imported: { path: "A:\\other.pdf", page: 1 } },
    ]);
    state = insertBlankAfter(state, state.pages[state.pages.length - 1]!.id);
    state = toggleDeleted(state, "p2");
    state = rotatePage(state, "p1", 90);

    const plan = buildApplyPlan(state);

    expect(plan.finalPageCount).toBe(6);
    expect(pageCountFromStages(plan)).toBe(6);
    expect(plan.stages.map((stage) => stage.type)).toEqual([
      "reorder",
      "extract_import",
      "merge_import",
      "insert_blank",
      "rotate",
    ]);
    expect(plan.stages[0]).toEqual({ type: "reorder", new_order: [1, 1, 2] });
    expect(plan.stages[1]).toEqual({
      type: "extract_import",
      input: "A:\\other.pdf",
      pages: [1, 2],
    });
    expect(plan.stages[2]).toMatchObject({ type: "merge_import", after_page_index: 1 });
    expect(plan.stages[4]).toEqual({ type: "rotate", rotations: [[5, 90]] });
  });

  it("uses repeated reorder indices for duplicates of the same original page", () => {
    const plan = buildApplyPlan(duplicate(createOrganizeState(2), "p1"));

    expect(plan.stages[0]).toEqual({ type: "reorder", new_order: [1, 2, 2] });
    expect(plan.finalPageCount).toBe(3);
  });

  it("emits an empty reorder that drops every original before a surviving blank", () => {
    // Oracle: T5.1 R1 — delete all originals, add one blank; the walk is one page
    // and the stage list contains the deletion (empty keep list).
    let state = insertBlankAfter(createOrganizeState(2), "p1");
    state = toggleDeleted(state, "p0");
    state = toggleDeleted(state, "p1");

    const plan = buildApplyPlan(state);

    expect(plan.finalPageCount).toBe(1);
    expect(pageCountFromStages(plan)).toBe(1);
    expect(plan.stages[0]).toEqual({ type: "reorder", new_order: [] });
    expect(plan.stages[1]).toMatchObject({ type: "insert_blank", after_page_index: -1 });
  });

  it("emits after_page_index -1 when a blank occupies the first slot", () => {
    // Oracle: T5.1 R2 — insert before page 1 is after_page_index -1, not 0.
    let state = insertBlankAfter(createOrganizeState(2), "p0");
    const blankId = state.pages[1]!.id;
    state = movePages(state, [blankId], 0);

    const plan = buildApplyPlan(state);

    expect(ids(state)).toEqual([blankId, "p0", "p1"]);
    expect(plan.stages[0]).toEqual({ type: "reorder", new_order: [1, 2] });
    expect(plan.stages[1]).toMatchObject({
      type: "insert_blank",
      after_page_index: -1,
    });
    expect(pageCountFromStages(plan)).toBe(3);
  });
});

describe("mergeImportSplit", () => {
  it("prepends at the start, appends at the end, and splits the current doc in the middle", () => {
    expect(mergeImportSplit(-1, 4)).toEqual({ mode: "prepend" });
    expect(mergeImportSplit(3, 4)).toEqual({ mode: "append" });
    expect(mergeImportSplit(1, 4)).toEqual({
      mode: "split",
      prefix: [1, 2],
      suffix: [3, 4],
    });
  });
});

describe("deleteSelected", () => {
  it("marks the selected pages deleted and leaves the others", () => {
    const selected = selectRange(selectOne(createOrganizeState(3), "p0"), "p0", "p1");

    const next = deleteSelected(selected);

    expect(next.pages.map((page) => page.deleted)).toEqual([true, true, false]);
  });
});

describe("organize undo push", () => {
  beforeEach(() => {
    historyStore.setState({ byDoc: {} });
  });

  it("pushes the previous state under the page-order label and restores it on undo", () => {
    let current = createOrganizeState(3);
    const before = current;
    const after = reverse(before);
    commit(before, after, (next) => {
      current = next;
    });

    expect(historyStore.getState().byDoc[DOC]?.undo.at(-1)?.label).toBe("organize");
    expect(ids(current)).toEqual(["p2", "p1", "p0"]);

    historyStore.getState().undo(DOC);
    expect(ids(current)).toEqual(["p0", "p1", "p2"]);

    historyStore.getState().redo(DOC);
    expect(ids(current)).toEqual(["p2", "p1", "p0"]);
  });
});
