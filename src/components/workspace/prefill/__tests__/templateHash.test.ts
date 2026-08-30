import { describe, expect, it } from "vitest";
import type { DetectedFormField } from "@/bindings";
import { fieldPositionKey, templateKey } from "../templateHash";

const A4 = { width: 595.3, height: 841.9 };

function field(
  id: string,
  rect: [number, number, number, number],
  kind: DetectedFormField["kind"] = "box",
): DetectedFormField {
  return { id, page_index: 0, rect, kind, confidence: 0.9 };
}

describe("templateKey", () => {
  it("gives the same key when the same form is detected twice with 1 pt jitter", () => {
    const first = [
      field("0:0", [100, 700, 250, 724]),
      field("0:1", [100, 640, 300, 660], "underline"),
    ];
    const jittered = [
      field("1:0", [101, 701, 251, 723]),
      field("1:1", [99, 639, 301, 661], "underline"),
    ];

    expect(templateKey(A4, jittered)).toBe(templateKey(A4, first));
  });

  it("gives a different key for a different form", () => {
    const timesheet = [
      field("0:0", [100, 700, 250, 724]),
      field("0:1", [100, 640, 300, 660], "underline"),
    ];
    const otherForm = [
      field("0:0", [40, 800, 200, 820]),
      field("0:1", [40, 760, 400, 780]),
      field("0:2", [40, 700, 120, 720], "underline"),
    ];

    expect(templateKey(A4, otherForm)).not.toBe(templateKey(A4, timesheet));
    expect(templateKey({ width: 612, height: 792 }, timesheet)).not.toBe(
      templateKey(A4, timesheet),
    );
  });

  it("is independent of detected-field id and source array order", () => {
    const a = [field("a", [20, 700, 80, 720]), field("b", [200, 700, 260, 720])];
    const b = [field("z", [200, 700, 260, 720]), field("y", [20, 700, 80, 720])];
    expect(templateKey(A4, a)).toBe(templateKey(A4, b));
  });
});

describe("fieldPositionKey", () => {
  it("uses the same 4 pt rounding so 1 pt jitter stays on the same field", () => {
    expect(fieldPositionKey(field("0:0", [101, 701, 251, 723]))).toBe(
      fieldPositionKey(field("other", [100, 700, 250, 724])),
    );
  });

  it("treats a different kind as a different field even at the same rect", () => {
    expect(fieldPositionKey(field("0:0", [100, 700, 250, 724], "box"))).not.toBe(
      fieldPositionKey(field("0:0", [100, 700, 250, 724], "underline")),
    );
  });
});
