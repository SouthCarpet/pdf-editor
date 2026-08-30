import { describe, expect, it } from "vitest";
import {
  bookletOrder,
  buildPrintPlan,
  reversePages,
  type PrintOptions,
} from "../printPlan";

const FILLED_OPTIONS: PrintOptions = {
  content: "filled",
  printAsImage: true,
  booklet: false,
  reverse: false,
};

describe("reversePages", () => {
  // Oracle: T4.4 requires a reversed copy, not mutation of the logical list.
  it("returns pages in reverse order and leaves the input unchanged", () => {
    const pages = [1, 2, 3, 4];

    expect(reversePages(pages)).toEqual([4, 3, 2, 1]);
    expect(pages).toEqual([1, 2, 3, 4]);
  });
});

describe("bookletOrder", () => {
  // Oracles: the outside-in sheet-side rule in the T4.4 binding brief.
  it("imposes four pages as two outside-in sheet sides", () => {
    expect(bookletOrder([1, 2, 3, 4])).toEqual([
      [4, 1],
      [2, 3],
    ]);
  });

  it("pads five pages with three blank slots", () => {
    expect(bookletOrder([1, 2, 3, 4, 5])).toEqual([
      [null, 1],
      [2, null],
      [null, 3],
      [4, 5],
    ]);
  });

  it("matches the binding example for eight pages", () => {
    expect(bookletOrder([1, 2, 3, 4, 5, 6, 7, 8])).toEqual([
      [8, 1],
      [2, 7],
      [6, 3],
      [4, 5],
    ]);
  });

  it("pads nine pages to twelve slots and keeps the outside-in order", () => {
    expect(bookletOrder([1, 2, 3, 4, 5, 6, 7, 8, 9])).toEqual([
      [null, 1],
      [2, null],
      [null, 3],
      [4, 9],
      [8, 5],
      [6, 7],
    ]);
  });
});

describe("buildPrintPlan", () => {
  it("maps filled pre-flight state to one rasterised page per sheet", () => {
    expect(buildPrintPlan(FILLED_OPTIONS, 3)).toEqual({
      source: "filled",
      rasterize: true,
      slotsPerSheet: 1,
      sheets: [
        [1, null],
        [2, null],
        [3, null],
      ],
      pageCount: 3,
    });
  });

  it("keeps rasterisation on for stale original-only state with the image switch off", () => {
    expect(
      buildPrintPlan(
        {
          content: "original",
          printAsImage: false,
          booklet: false,
          reverse: false,
        },
        2,
      ),
    ).toMatchObject({
      source: "original",
      rasterize: true,
      slotsPerSheet: 1,
    });
  });

  it("reverses the logical pages before booklet imposition when both are selected", () => {
    expect(
      buildPrintPlan(
        {
          content: "filled",
          printAsImage: true,
          booklet: true,
          reverse: true,
        },
        8,
      ).sheets,
    ).toEqual([
      [1, 8],
      [7, 2],
      [3, 6],
      [5, 4],
    ]);
  });
});
