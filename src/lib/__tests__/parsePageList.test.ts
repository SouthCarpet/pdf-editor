import { describe, it, expect } from "vitest";
import { parsePageList } from "../parsePageList";

describe("parsePageList", () => {
  it("parses a single page", () => {
    expect(parsePageList("3", 10)).toEqual([3]);
  });

  it("parses a comma-separated list with ranges", () => {
    expect(parsePageList("1,3,5-7", 10)).toEqual([1, 3, 5, 6, 7]);
  });

  it("deduplicates overlapping entries", () => {
    expect(parsePageList("1,1,2-3,3", 10)).toEqual([1, 2, 3]);
  });

  it("tolerates reversed ranges (2-1 becomes 1,2)", () => {
    expect(parsePageList("2-1", 10)).toEqual([1, 2]);
  });

  it("returns null on numbers above max", () => {
    expect(parsePageList("1,12", 10)).toBeNull();
  });

  it("returns null on numbers below 1", () => {
    expect(parsePageList("0,2", 10)).toBeNull();
  });

  it("returns null on non-numeric tokens", () => {
    expect(parsePageList("abc", 10)).toBeNull();
    expect(parsePageList("1,foo", 10)).toBeNull();
  });

  it("returns null on empty/whitespace input", () => {
    expect(parsePageList("", 10)).toBeNull();
    expect(parsePageList("   ", 10)).toBeNull();
  });

  it("returns null when range bounds are out of range", () => {
    expect(parsePageList("5-12", 10)).toBeNull();
    expect(parsePageList("0-3", 10)).toBeNull();
  });

  it("returns sorted output even when input is unsorted", () => {
    expect(parsePageList("5,1,3", 10)).toEqual([1, 3, 5]);
  });
});
