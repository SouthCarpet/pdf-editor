import type { DetectedFormField } from "@/bindings";
import { orderFieldsForReading } from "../fieldOrder";

export interface PageSize {
  width: number;
  height: number;
}

const GRID_PT = 4;

function coordinate(value: number | null): number {
  return value ?? 0;
}

function roundToGrid(value: number): number {
  return Math.round(value / GRID_PT) * GRID_PT;
}

function roundedRect(rect: DetectedFormField["rect"]): [number, number, number, number] {
  return [
    roundToGrid(coordinate(rect[0])),
    roundToGrid(coordinate(rect[1])),
    roundToGrid(coordinate(rect[2])),
    roundToGrid(coordinate(rect[3])),
  ];
}

/** Position identity for a detected field: kind plus rect on a 4 pt grid. */
export function fieldPositionKey(field: DetectedFormField): string {
  const [x0, y0, x1, y1] = roundedRect(field.rect);
  return `${field.kind}:${x0},${y0},${x1},${y1}`;
}

/** FNV-1a 32-bit, hex. Stable across sessions so a stored template still matches. */
function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Fingerprint of one page of a scanned form: whole-point page size plus the
 * detected-field layout in reading order, each field on the 4 pt grid.
 */
export function templateKey(pageSize: PageSize, fields: readonly DetectedFormField[]): string {
  const width = Math.round(pageSize.width);
  const height = Math.round(pageSize.height);
  const layout = orderFieldsForReading(fields).map(fieldPositionKey).join("|");
  return fnv1aHex(`${width}x${height}|${layout}`);
}

export function roundedRectKey(rect: DetectedFormField["rect"]): string {
  return roundedRect(rect).join(",");
}
