import { describe, expect, it } from "vitest";
import {
  EMPTY_FILLED_FIELDS,
  markFieldFilled,
  unmarkFieldForClientId,
} from "../filledFieldsState";

const KEY = "A:\\docs\\a.pdf\u00000";

describe("filledFieldsState", () => {
  it("marks a field filled by a client id", () => {
    const next = markFieldFilled(EMPTY_FILLED_FIELDS, KEY, "0:0", "client-1");
    expect(next.ids.has("0:0")).toBe(true);
    expect(next.fieldIdByClientId["client-1"]).toBe("0:0");
  });

  it("accumulates several filled fields under the same key", () => {
    let state = markFieldFilled(EMPTY_FILLED_FIELDS, KEY, "0:0", "client-1");
    state = markFieldFilled(state, KEY, "0:1", "client-2");
    expect([...state.ids].sort()).toEqual(["0:0", "0:1"]);
  });

  it("unmarks the field a deleted annotation was filling (R7b)", () => {
    let state = markFieldFilled(EMPTY_FILLED_FIELDS, KEY, "0:0", "client-1");
    state = unmarkFieldForClientId(state, KEY, "client-1");
    expect(state.ids.has("0:0")).toBe(false);
    expect(state.fieldIdByClientId["client-1"]).toBeUndefined();
  });

  it("leaves other filled fields untouched when one is unmarked", () => {
    let state = markFieldFilled(EMPTY_FILLED_FIELDS, KEY, "0:0", "client-1");
    state = markFieldFilled(state, KEY, "0:1", "client-2");
    state = unmarkFieldForClientId(state, KEY, "client-1");
    expect(state.ids.has("0:0")).toBe(false);
    expect(state.ids.has("0:1")).toBe(true);
  });

  it("is a no-op for a client id that was never tracked", () => {
    const state = markFieldFilled(EMPTY_FILLED_FIELDS, KEY, "0:0", "client-1");
    const next = unmarkFieldForClientId(state, KEY, "unknown-client");
    expect(next).toBe(state);
  });

  it("is a no-op when the key is stale (a page/document switch already happened)", () => {
    const state = markFieldFilled(EMPTY_FILLED_FIELDS, KEY, "0:0", "client-1");
    const otherKey = "A:\\docs\\a.pdf\u00001";
    const next = unmarkFieldForClientId(state, otherKey, "client-1");
    expect(next).toBe(state);
    expect(state.ids.has("0:0")).toBe(true);
  });

  it("starts a fresh set when marking under a new key", () => {
    const state = markFieldFilled(EMPTY_FILLED_FIELDS, KEY, "0:0", "client-1");
    const otherKey = "A:\\docs\\b.pdf\u00000";
    const next = markFieldFilled(state, otherKey, "1:0", "client-2");
    expect(next.key).toBe(otherKey);
    expect(next.ids.has("0:0")).toBe(false);
    expect(next.ids.has("1:0")).toBe(true);
  });
});
