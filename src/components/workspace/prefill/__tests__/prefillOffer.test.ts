import { describe, expect, it } from "vitest";
import type { DetectedFormField } from "@/bindings";
import { fieldPositionKey } from "../templateHash";
import { prefillOffer } from "../prefillOffer";
import type { PrefillRecord } from "@/stores/prefillStore";

function field(
  id: string,
  rect: [number, number, number, number],
  kind: DetectedFormField["kind"] = "box",
): DetectedFormField {
  return { id, page_index: 0, rect, kind, confidence: 0.9 };
}

const name = field("0:0", [100, 700, 250, 724]);
const site = field("0:1", [100, 640, 300, 660], "underline");
const date = field("0:2", [400, 700, 500, 724]);
const hours = field("0:3", [400, 640, 440, 660]);

function record(values: Record<string, string>): PrefillRecord {
  return { templateKey: "t", savedAt: 1_700_000_000_000, values };
}

describe("prefillOffer", () => {
  it("returns stable values for still-unfilled fields and skips dates and hours", () => {
    const last = record({
      [fieldPositionKey(name)]: "Peter Novák",
      [fieldPositionKey(site)]: "Stavenisko A",
      [fieldPositionKey(date)]: "31. 8. 2026",
      [fieldPositionKey(hours)]: "8",
    });

    expect(prefillOffer(last, [name, site, date, hours], new Set())).toEqual({
      [name.id]: "Peter Novák",
      [site.id]: "Stavenisko A",
    });
  });

  it("skips a field that is already filled", () => {
    const last = record({
      [fieldPositionKey(name)]: "Peter Novák",
      [fieldPositionKey(site)]: "Stavenisko A",
    });

    expect(prefillOffer(last, [name, site], new Set([name.id]))).toEqual({
      [site.id]: "Stavenisko A",
    });
  });

  it("returns an empty object when there is no record or no stable leftover", () => {
    expect(prefillOffer(null, [name], new Set())).toEqual({});
    expect(
      prefillOffer(record({ [fieldPositionKey(date)]: "2026-08-31" }), [date], new Set()),
    ).toEqual({});
  });
});
