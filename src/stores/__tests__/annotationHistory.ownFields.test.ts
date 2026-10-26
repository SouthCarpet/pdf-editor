import { beforeEach, describe, expect, it } from "vitest";
import type { Annotation } from "@/bindings";
import { useAnnotations } from "../annotationsStore";
import { historyStore } from "../historyStore";

const DOC = "A:/docs/form.pdf";
const FIELD: Annotation = {
  type: "form_field", page: 0, rect: [100, 650, 240, 672],
  name: "Meno", kind: "text", multiline: false, font_size: 0,
};

describe("own field history (plan 119 §2.3)", () => {
  beforeEach(() => {
    useAnnotations.setState({ byDoc: {} });
    historyStore.setState({ byDoc: {} });
  });

  it("T4 restores literal lists through add, move, delete, three undos and one redo", () => {
    const id = useAnnotations.getState().add(DOC, FIELD);
    expect(useAnnotations.getState().byDoc[DOC]).toEqual([{ ...FIELD, __clientId: id }]);
    useAnnotations.getState().update(DOC, id, { rect: [100, 600, 240, 622] });
    expect(useAnnotations.getState().byDoc[DOC]).toEqual([{ ...FIELD, rect: [100, 600, 240, 622], __clientId: id }]);
    useAnnotations.getState().remove(DOC, id);
    expect(useAnnotations.getState().byDoc[DOC]).toEqual([]);
    historyStore.getState().undo(DOC);
    expect(useAnnotations.getState().byDoc[DOC]).toEqual([{ ...FIELD, rect: [100, 600, 240, 622], __clientId: id }]);
    historyStore.getState().undo(DOC);
    expect(useAnnotations.getState().byDoc[DOC]).toEqual([{ ...FIELD, __clientId: id }]);
    historyStore.getState().undo(DOC);
    expect(useAnnotations.getState().byDoc[DOC]).toEqual([]);
    historyStore.getState().redo(DOC);
    expect(useAnnotations.getState().byDoc[DOC]).toEqual([{ ...FIELD, __clientId: id }]);
  });

  it("T9 updates a form field and ignores highlight, the first other binding variant", () => {
    const id = useAnnotations.getState().add(DOC, FIELD);
    const highlight: Annotation = { type: "highlight", page: 0, quads: [], color: [1, 1, 0], opacity: 1 };
    const otherId = useAnnotations.getState().add(DOC, highlight);
    historyStore.getState().clear(DOC);
    useAnnotations.getState().update(DOC, id, { rect: [10, 10, 60, 40] });
    expect(useAnnotations.getState().byDoc[DOC][0]).toEqual({ ...FIELD, rect: [10, 10, 60, 40], __clientId: id });
    expect(historyStore.getState().byDoc[DOC].undo).toHaveLength(1);
    useAnnotations.getState().update(DOC, otherId, { rect: [10, 10, 60, 40] });
    expect(useAnnotations.getState().byDoc[DOC][1]).toEqual({ ...highlight, __clientId: otherId });
    expect(historyStore.getState().byDoc[DOC].undo).toHaveLength(1);
  });
});
