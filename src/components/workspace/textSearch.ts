import type * as pdfjs from "pdfjs-dist";

type TextContent = Awaited<ReturnType<pdfjs.PDFPageProxy["getTextContent"]>>;
type TextItem = Extract<TextContent["items"][number], { str: string }>;

export type TextRect = [x1: number, y1: number, x2: number, y2: number];

interface IndexedTextItem {
  rect: TextRect;
}

export interface PageTextIndex {
  text: string;
  itemByCharacter: Array<number | null>;
  items: IndexedTextItem[];
}

export interface TextMatch {
  page: number;
  rects: TextRect[];
}

function isTextItem(item: TextContent["items"][number]): item is TextItem {
  return "str" in item;
}

function itemRect(item: TextItem): TextRect {
  const [a = 1, b = 0, c = 0, d = 1, e = 0, f = 0] = item.transform.map(Number);
  const horizontalLength = Math.hypot(a, b) || 1;
  const verticalLength = Math.hypot(c, d) || 1;
  const horizontal = [a / horizontalLength, b / horizontalLength] as const;
  const vertical = [c / verticalLength, d / verticalLength] as const;
  const corners = [
    [e, f],
    [e + horizontal[0] * item.width, f + horizontal[1] * item.width],
    [e + vertical[0] * item.height, f + vertical[1] * item.height],
    [
      e + horizontal[0] * item.width + vertical[0] * item.height,
      f + horizontal[1] * item.width + vertical[1] * item.height,
    ],
  ];
  const xs = corners.map(([x]) => x);
  const ys = corners.map(([, y]) => y);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/** Joins PDF.js text items in reading order and keeps a character-to-item
 * map so a string match can be projected back onto the page. PDF.js emits
 * explicit whitespace items; only an item-marked line ending is added. */
export function buildPageIndex(textContent: Pick<TextContent, "items">): PageTextIndex {
  const page: PageTextIndex = { text: "", itemByCharacter: [], items: [] };

  for (const rawItem of textContent.items) {
    if (!isTextItem(rawItem)) continue;
    const itemIndex = page.items.length;
    page.items.push({ rect: itemRect(rawItem) });
    page.text += rawItem.str;
    page.itemByCharacter.push(...Array.from(rawItem.str, () => itemIndex));
    if (rawItem.hasEOL) {
      page.text += "\n";
      page.itemByCharacter.push(null);
    }
  }

  return page;
}

interface NormalizedPage {
  text: string;
  itemByCharacter: Array<number | null>;
}

/** Search normalization: lowercase Unicode NFD text and remove every
 * combining mark. This is case-insensitive and diacritics-insensitive, so
 * composed and decomposed forms such as "Šulek" both match "sulek". */
function normalizePage(page: PageTextIndex): NormalizedPage {
  let text = "";
  const itemByCharacter: Array<number | null> = [];

  Array.from(page.text).forEach((character, characterIndex) => {
    const normalized = character.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    text += normalized;
    itemByCharacter.push(
      ...Array.from(
        { length: normalized.length },
        () => page.itemByCharacter[characterIndex] ?? null,
      ),
    );
  });

  return { text, itemByCharacter };
}

function normalizeQuery(query: string): string {
  return query.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function rectsForMatch(
  page: PageTextIndex,
  normalized: NormalizedPage,
  start: number,
  length: number,
): TextRect[] {
  const itemIndexes = new Set<number>();
  for (let offset = start; offset < start + length; offset += 1) {
    const itemIndex = normalized.itemByCharacter[offset];
    if (itemIndex !== null && itemIndex !== undefined) itemIndexes.add(itemIndex);
  }
  return Array.from(itemIndexes, (itemIndex) => page.items[itemIndex].rect);
}

/** Finds every occurrence across the indexed pages. Page numbers are
 * zero-based to match the workspace and PDF.js page-index convention. */
export function findMatches(index: readonly PageTextIndex[], query: string): TextMatch[] {
  const needle = normalizeQuery(query);
  if (needle.length === 0) return [];

  const matches: TextMatch[] = [];
  index.forEach((page, pageIndex) => {
    const normalized = normalizePage(page);
    let start = normalized.text.indexOf(needle);
    while (start !== -1) {
      matches.push({
        page: pageIndex,
        rects: rectsForMatch(page, normalized, start, needle.length),
      });
      start = normalized.text.indexOf(needle, start + 1);
    }
  });
  return matches;
}
