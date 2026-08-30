import { describe, expect, it } from "vitest";
import { textBlockOffset } from "../textBlockPlacement";

const RECT: [number, number, number, number] = [0, 0, 100, 40];
const LINES = ["first", "second"];

describe("textBlockOffset", () => {
  it("places a two-line 10pt block at the top of a 100x40pt box", () => {
    expect(textBlockOffset(RECT, LINES, 10, 1.2, "top")).toBe(0);
  });

  it("places a two-line 10pt block in the middle of a 100x40pt box", () => {
    expect(textBlockOffset(RECT, LINES, 10, 1.2, "middle")).toBe(8);
  });

  it("places a two-line 10pt block at the bottom of a 100x40pt box", () => {
    expect(textBlockOffset(RECT, LINES, 10, 1.2, "bottom")).toBe(16);
  });
});
