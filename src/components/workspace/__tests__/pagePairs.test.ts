import { describe, expect, it } from "vitest";
import { pagePairs, spreadFor, spreadIndexOf } from "../pagePairs";

describe("pagePairs", () => {
  // Oracle: T3.2 R1 defines a right-side cover and a null final well.
  it.each([
    [1, [[null, 0]]],
    [2, [[null, 0], [1, null]]],
    [3, [[null, 0], [1, 2]]],
    [4, [[null, 0], [1, 2], [3, null]]],
    [5, [[null, 0], [1, 2], [3, 4]]],
    [
      12,
      [[null, 0], [1, 2], [3, 4], [5, 6], [7, 8], [9, 10], [11, null]],
    ],
  ] as const)("pairs %i pages with the cover on the right", (count, expected) => {
    expect(pagePairs(count)).toEqual(expected);
  });

  it("returns the spread and spread index containing each side", () => {
    expect(spreadFor(0, 12)).toEqual([null, 0]);
    expect(spreadFor(1, 12)).toEqual([1, 2]);
    expect(spreadFor(2, 12)).toEqual([1, 2]);
    expect(spreadFor(11, 12)).toEqual([11, null]);
    expect(spreadIndexOf(0, 12)).toBe(0);
    expect(spreadIndexOf(2, 12)).toBe(1);
    expect(spreadIndexOf(11, 12)).toBe(6);
  });

  it("returns no spread for a page outside the document", () => {
    expect(spreadFor(-1, 5)).toBeNull();
    expect(spreadFor(5, 5)).toBeNull();
    expect(spreadIndexOf(5, 5)).toBe(-1);
  });
});
