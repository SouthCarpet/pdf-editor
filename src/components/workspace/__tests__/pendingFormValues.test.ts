// Plan 119 p1c: a typed AcroForm value shows on the page at its widget,
// before any save. This is the pure part: which typed values the page draws,
// and what each draws.
import { describe, expect, it } from "vitest";
import type { Annotation } from "@/bindings";
import type { ClientAnnotation } from "@/stores/annotationsStore";
import { NO_FORM_DRAFT, type FormDraft, type FormPlace } from "@/stores/formDraftStore";
import { pageHasPendingValue, pendingFormValues } from "../pendingFormValues";

const RECT: FormPlace["rect"] = [36, 700, 240, 724];

function place(kind: FormPlace["kind"], page_index: number | null = 0): FormPlace {
  return { kind, page_index, rect: RECT };
}

function draft(overrides: Partial<FormDraft>): FormDraft {
  return { ...NO_FORM_DRAFT, ...overrides };
}

describe("pendingFormValues", () => {
  it("is empty when nothing is typed", () => {
    expect(pendingFormValues(NO_FORM_DRAFT)).toEqual([]);
  });

  it("draws a typed text value at its widget rect and page", () => {
    const values = pendingFormValues(
      draft({ values: { "10:0": "Ľubica Šťastná" }, places: { "10:0": place("text", 2) } }),
    );
    expect(values).toEqual([{ fieldId: "10:0", page: 2, rect: RECT, text: "Ľubica Šťastná" }]);
  });

  it("draws a chosen option of a choice field as text", () => {
    const values = pendingFormValues(
      draft({ values: { "10:0": "Košice" }, places: { "10:0": place("choice") } }),
    );
    expect(values[0]?.text).toBe("Košice");
  });

  it("draws a cleared value as an empty cover over the old appearance", () => {
    const values = pendingFormValues(
      draft({ values: { "10:0": null }, places: { "10:0": place("text") } }),
    );
    expect(values).toEqual([{ fieldId: "10:0", page: 0, rect: RECT, text: "" }]);
  });

  it("draws a check mark for a checked box and nothing for an unchecked one", () => {
    const values = pendingFormValues(
      draft({
        values: { "1:0": "Yes", "2:0": "Off", "3:0": null },
        places: { "1:0": place("checkbox"), "2:0": place("checkbox"), "3:0": place("checkbox") },
      }),
    );
    expect(values.map((value) => value.text)).toEqual(["✓", "", ""]);
  });

  it("leaves out a value the last save wrote", () => {
    const values = pendingFormValues(
      draft({
        values: { "10:0": "Alice", "11:0": "Bob" },
        saved: { "10:0": "Alice" },
        places: { "10:0": place("text"), "11:0": place("text") },
      }),
    );
    expect(values.map((value) => value.fieldId)).toEqual(["11:0"]);
  });

  it("leaves out radio groups, which show in the panel only", () => {
    const values = pendingFormValues(
      draft({ values: { "10:0": "Choice1" }, places: { "10:0": place("radio") } }),
    );
    expect(values).toEqual([]);
  });

  it("leaves out a field with no page or no place", () => {
    const values = pendingFormValues(
      draft({
        values: { "10:0": "x", "11:0": "y" },
        places: { "10:0": place("text", null) },
      }),
    );
    expect(values).toEqual([]);
  });
});

describe("pageHasPendingValue", () => {
  const freeText = {
    type: "free_text",
    page: 1,
    rect: [0, 0, 10, 10],
    contents: "x",
    __clientId: "c1",
  } as unknown as ClientAnnotation;
  const note = { type: "note", page: 0, __clientId: "c2" } as unknown as Annotation as ClientAnnotation;
  const formValue = { fieldId: "10:0", page: 2, rect: RECT, text: "x" };

  it("is true for a pending FreeText on that page", () => {
    expect(pageHasPendingValue([freeText], [], 1)).toBe(true);
    expect(pageHasPendingValue([freeText], [], 0)).toBe(false);
  });

  it("is true for a typed form value on that page", () => {
    expect(pageHasPendingValue([], [formValue], 2)).toBe(true);
    expect(pageHasPendingValue([], [formValue], 1)).toBe(false);
  });

  it("ignores annotation types the page preview does not draw", () => {
    expect(pageHasPendingValue([note], [], 0)).toBe(false);
  });
});
