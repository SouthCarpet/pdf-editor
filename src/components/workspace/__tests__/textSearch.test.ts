import type * as pdfjs from "pdfjs-dist";
import { describe, expect, it } from "vitest";
import { buildPageIndex, findMatches } from "../textSearch";

type TextContent = Awaited<ReturnType<pdfjs.PDFPageProxy["getTextContent"]>>;
type TextItem = Extract<TextContent["items"][number], { str: string }>;

function textItem(
  str: string,
  transform: number[],
  width: number,
  height: number,
  hasEOL = false,
): TextItem {
  return { str, transform, width, height, hasEOL, dir: "ltr", fontName: "Helvetica" };
}

function content(items: TextItem[]): Pick<TextContent, "items"> {
  return { items };
}

describe("textSearch", () => {
  // Oracle: T3.1 R3 explicitly requires case- and diacritics-insensitive search.
  it("matches composed and decomposed diacritics without case sensitivity", () => {
    const page = buildPageIndex(content([textItem("Šulek S\u030culek", [1, 0, 0, 1, 10, 20], 80, 12)]));
    expect(findMatches([page], "sulek")).toHaveLength(2);
  });

  // Oracle: T3.1 R3 requires a per-document, multi-page match count.
  it("counts matches across pages in page order", () => {
    const first = buildPageIndex(content([textItem("needle needle", [1, 0, 0, 1, 10, 20], 90, 12)]));
    const second = buildPageIndex(content([textItem("a needle", [1, 0, 0, 1, 10, 40], 60, 12)]));
    expect(findMatches([first, second], "needle").map((match) => match.page)).toEqual([0, 0, 1]);
  });

  // Oracle: T3.1 R3 requires a stable zero-match result for the count UI.
  it("returns no matches when the query is absent", () => {
    const page = buildPageIndex(content([textItem("invoice", [1, 0, 0, 1, 10, 20], 50, 12)]));
    expect(findMatches([page], "receipt")).toEqual([]);
  });

  // Oracle: T3.1 R3 requires match item rectangles for Konva highlights.
  it("returns the transformed item rectangles covered by a cross-item match", () => {
    const page = buildPageIndex(
      content([
        textItem("Šu", [1, 0, 0, 1, 12, 30], 14, 9),
        textItem("lek", [1, 0, 0, 1, 26, 30], 21, 9),
      ]),
    );
    expect(findMatches([page], "sulek")[0].rects).toEqual([
      [12, 30, 26, 39],
      [26, 30, 47, 39],
    ]);
  });
});
