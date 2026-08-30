import type { VerticalAlign } from "@/bindings";

/**
 * Offset from the rectangle's top edge to the complete text block.
 * `lineHeight` is a multiplier. The Rust save path uses the same formula:
 * block height is lineCount * fontSize * lineHeight, then top/middle/bottom
 * receive 0%, 50%, or 100% of the non-negative remaining height.
 */
export function textBlockOffset(
  rect: readonly [number, number, number, number],
  lines: readonly string[],
  fontSize: number,
  lineHeight: number,
  verticalAlign: VerticalAlign
): number {
  const rectHeight = Math.abs(rect[3] - rect[1]);
  const lineCount = Math.max(lines.length, 1);
  const blockHeight = lineCount * Math.max(fontSize, 0) * Math.max(lineHeight, 0);
  const freeSpace = Math.max(rectHeight - blockHeight, 0);

  switch (verticalAlign) {
    case "top":
      return 0;
    case "middle":
      return freeSpace / 2;
    case "bottom":
      return freeSpace;
  }
}
