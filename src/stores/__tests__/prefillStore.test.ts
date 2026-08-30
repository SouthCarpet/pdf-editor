import { beforeEach, describe, expect, it } from "vitest";
import type { Annotation, DetectedFormField } from "@/bindings";
import { fieldPositionKey, templateKey } from "@/components/workspace/prefill/templateHash";
import { shouldShowPrefillBanner } from "@/components/workspace/prefill/prefillOffer";
import {
  PREFILL_TEMPLATE_CAP,
  PREFILL_STORE_KEY,
  usePrefillStore,
} from "../prefillStore";
import { useAnnotations, type ClientAnnotation } from "../annotationsStore";
import { filledIdsFor, useFilledFields } from "../filledFieldsStore";
import { applyPrefillFills } from "@/components/workspace/prefill/applyPrefill";
import { prefillOffer } from "@/components/workspace/prefill/prefillOffer";

const DOC = "A:\\scans\\hodiny.pdf";
const PAGE = { width: 595, height: 842 };

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

function freeText(rect: DetectedFormField["rect"], contents: string): Annotation {
  return {
    type: "free_text",
    page: 0,
    rect,
    contents,
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
  };
}

function resetPrefillStore() {
  localStorage.removeItem(PREFILL_STORE_KEY);
  usePrefillStore.setState({
    records: [],
    layoutsByDoc: {},
    dismissedDocIds: [],
  });
}

describe("prefillStore", () => {
  beforeEach(() => {
    resetPrefillStore();
    useAnnotations.setState({ byDoc: {}, mode: "highlight" });
    useFilledFields.setState({ byDoc: {} });
  });

  it("records the latest fill only, replacing the previous values for that template", () => {
    usePrefillStore.getState().rememberLayout(DOC, PAGE, [name, site, date]);
    usePrefillStore.getState().recordFill(DOC, [
      { ...freeText(name.rect, "Peter Novák"), __clientId: "a" },
      { ...freeText(site.rect, "Stavenisko A"), __clientId: "b" },
      { ...freeText(date.rect, "31. 7. 2026"), __clientId: "c" },
    ] as ClientAnnotation[]);

    const key = templateKey(PAGE, [name, site, date]);
    expect(usePrefillStore.getState().recordForTemplate(key)?.values).toEqual({
      [fieldPositionKey(name)]: "Peter Novák",
      [fieldPositionKey(site)]: "Stavenisko A",
      [fieldPositionKey(date)]: "31. 7. 2026",
    });

    usePrefillStore.getState().recordFill(DOC, [
      { ...freeText(name.rect, "Peter Novák"), __clientId: "d" },
    ] as ClientAnnotation[]);

    const again = usePrefillStore.getState().recordForTemplate(key);
    expect(again?.values).toEqual({
      [fieldPositionKey(name)]: "Peter Novák",
    });
    expect(again?.values[fieldPositionKey(site)]).toBeUndefined();
    expect(usePrefillStore.getState().records).toHaveLength(1);
  });

  it(`keeps only the ${PREFILL_TEMPLATE_CAP} most recently used templates`, () => {
    for (let index = 0; index < PREFILL_TEMPLATE_CAP + 1; index += 1) {
      const unique = field("0:0", [100 + index * 8, 700, 250, 724]);
      const doc = `${DOC}:${index}`;
      usePrefillStore.getState().rememberLayout(doc, PAGE, [unique]);
      usePrefillStore.getState().recordFill(
        doc,
        [{ ...freeText(unique.rect, "Peter"), __clientId: String(index) }] as ClientAnnotation[],
        1_700_000_000_000 + index,
      );
    }

    expect(usePrefillStore.getState().records).toHaveLength(PREFILL_TEMPLATE_CAP);
    const first = field("0:0", [100, 700, 250, 724]);
    expect(
      usePrefillStore.getState().recordForTemplate(templateKey(PAGE, [first])),
    ).toBeUndefined();
    const last = field("0:0", [100 + PREFILL_TEMPLATE_CAP * 8, 700, 250, 724]);
    expect(
      usePrefillStore.getState().recordForTemplate(templateKey(PAGE, [last])),
    ).toBeDefined();
  });
});

describe("prefill banner (store-level)", () => {
  beforeEach(() => {
    resetPrefillStore();
    useAnnotations.setState({ byDoc: {}, mode: "highlight" });
    useFilledFields.setState({ byDoc: {} });
  });

  it("offers when a matching record has a stable value, and Nie hides it for this document this session", () => {
    usePrefillStore.getState().rememberLayout(DOC, PAGE, [name, site, date]);
    usePrefillStore.getState().recordFill(DOC, [
      { ...freeText(name.rect, "Peter Novák"), __clientId: "a" },
      { ...freeText(date.rect, "31. 8. 2026"), __clientId: "c" },
    ] as ClientAnnotation[]);

    const record = usePrefillStore.getState().recordForTemplate(templateKey(PAGE, [name, site, date]));
    expect(
      shouldShowPrefillBanner({
        record,
        fields: [name, site, date],
        filledIds: new Set(),
        dismissed: usePrefillStore.getState().isDismissed(DOC),
      }),
    ).toBe(true);

    usePrefillStore.getState().dismissOffer(DOC);
    expect(usePrefillStore.getState().isDismissed(DOC)).toBe(true);
    expect(
      shouldShowPrefillBanner({
        record,
        fields: [name, site, date],
        filledIds: new Set(),
        dismissed: usePrefillStore.getState().isDismissed(DOC),
      }),
    ).toBe(false);

    const raw = localStorage.getItem(PREFILL_STORE_KEY) ?? "";
    expect(raw).not.toContain(DOC);
    expect(raw).not.toContain("dismissedDocIds");
  });

  it("does not apply values until applyPrefillFills runs, and then marks the stable fields filled", () => {
    let nextId = 0;
    Object.assign(globalThis.crypto, {
      randomUUID: () => `client-${(nextId += 1)}`,
    });
    const last = {
      templateKey: templateKey(PAGE, [name, site]),
      savedAt: 1,
      values: {
        [fieldPositionKey(name)]: "Peter Novák",
        [fieldPositionKey(site)]: "Stavenisko A",
      },
    };
    const toApply = prefillOffer(last, [name, site], new Set());
    expect(useAnnotations.getState().byDoc[DOC]).toBeUndefined();

    applyPrefillFills({
      docPath: DOC,
      pageKey: `${DOC}\u00000`,
      fields: [name, site],
      valuesByFieldId: toApply,
    });

    const pending = useAnnotations.getState().byDoc[DOC];
    expect(pending).toHaveLength(2);
    expect(pending.map((item) => (item.type === "free_text" ? item.contents : "")).sort()).toEqual(
      ["Peter Novák", "Stavenisko A"],
    );
    const filled = filledIdsFor(DOC, `${DOC}\u00000`);
    expect(filled.has(name.id)).toBe(true);
    expect(filled.has(site.id)).toBe(true);
  });
});
