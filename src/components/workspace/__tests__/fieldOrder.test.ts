// Oracle: Plan 062 T2.1 R1, including PDF y-up row order and wraparound.
import { describe, expect, it } from "vitest";
import type { DetectedFormField } from "@/bindings";
import { nextField, orderFieldsForReading } from "../fieldOrder";

function field(id: string, rect: [number, number, number, number]): DetectedFormField {
  return { id, page_index: 0, rect, kind: "box", confidence: 0.9 };
}

describe("orderFieldsForReading", () => {
  it("orders two PDF y-up rows from page top to bottom, then left to right", () => {
    const fields = [
      field("bottom-right", [200, 590, 240, 610]),
      field("top-right", [200, 695, 240, 715]),
      field("bottom-left", [20, 600, 60, 620]),
      field("top-left", [20, 700, 60, 720]),
    ];

    expect(orderFieldsForReading(fields).map(({ id }) => id)).toEqual([
      "top-left",
      "top-right",
      "bottom-left",
      "bottom-right",
    ]);
  });

  it("keeps ragged columns in their spatial left-to-right order", () => {
    const fields = [
      field("row-two-middle", [120, 600, 160, 620]),
      field("row-one-right", [240, 700, 280, 720]),
      field("row-one-left", [20, 700, 60, 720]),
    ];

    expect(orderFieldsForReading(fields).map(({ id }) => id)).toEqual([
      "row-one-left",
      "row-one-right",
      "row-two-middle",
    ]);
  });

  it("breaks exact position ties by field id", () => {
    const fields = [
      field("field-b", [20, 700, 60, 720]),
      field("field-a", [20, 700, 60, 720]),
    ];

    expect(orderFieldsForReading(fields).map(({ id }) => id)).toEqual(["field-a", "field-b"]);
  });
});

describe("nextField", () => {
  const fields = [
    field("first", [20, 700, 60, 720]),
    field("second", [100, 700, 140, 720]),
  ];

  it("wraps next from the last field to the first", () => {
    expect(nextField(fields, "second", "next")?.id).toBe("first");
  });

  it("wraps previous from the first field to the last", () => {
    expect(nextField(fields, "first", "previous")?.id).toBe("second");
  });

  it("returns null for an empty field list", () => {
    expect(nextField([], "missing", "next")).toBeNull();
  });
});
