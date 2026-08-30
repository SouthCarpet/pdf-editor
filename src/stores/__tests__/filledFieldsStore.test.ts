// Plan 062 T4.3 R2: filled marks live in this store. Serialise two filled
// marks, restore into an empty store, and the page's filledIds contain both.
import { beforeEach, describe, expect, it } from "vitest";
import {
  deserializeFilledMarks,
  serializeFilledMarks,
} from "@/components/workspace/autosave";
import {
  EMPTY_FILLED_FIELDS,
  markFieldFilled,
} from "@/components/workspace/filledFieldsState";
import { filledIdsFor, filledMarksFor, useFilledFields } from "../filledFieldsStore";

const DOC = "A:\\scans\\hodiny.pdf";
const PAGE_KEY = `${DOC}\u00000`;

describe("filledFieldsStore", () => {
  beforeEach(() => {
    useFilledFields.setState({ byDoc: {} });
  });

  it("restores two serialised filled marks into an empty store so the page filledIds contain both", () => {
    let live = markFieldFilled(EMPTY_FILLED_FIELDS, PAGE_KEY, "0:0", "client-a");
    live = markFieldFilled(live, PAGE_KEY, "0:1", "client-b");
    const snapshot = serializeFilledMarks(live);

    useFilledFields.setState({ byDoc: {} });
    expect(filledMarksFor(DOC).ids.size).toBe(0);

    useFilledFields.getState().restore(DOC, deserializeFilledMarks(snapshot));

    const filledIds = filledIdsFor(DOC, PAGE_KEY);
    expect([...filledIds].sort()).toEqual(["0:0", "0:1"]);
    expect(filledMarksFor(DOC).fieldIdByClientId["client-a"]).toBe("0:0");
    expect(filledMarksFor(DOC).fieldIdByClientId["client-b"]).toBe("0:1");
  });

  it("setFilled writes are what filledMarksFor (and autosave) would read", () => {
    useFilledFields.getState().setFilled(DOC, (current) =>
      markFieldFilled(current, PAGE_KEY, "0:0", "client-a"),
    );
    useFilledFields.getState().setFilled(DOC, (current) =>
      markFieldFilled(current, PAGE_KEY, "0:1", "client-b"),
    );
    expect([...serializeFilledMarks(filledMarksFor(DOC)).ids].sort()).toEqual(["0:0", "0:1"]);
  });
});
