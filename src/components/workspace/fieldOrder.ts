import type { DetectedFormField } from "@/bindings";

export type FieldDirection = "next" | "previous";

interface PositionedField {
  field: DetectedFormField;
  centerX: number;
  centerY: number;
  height: number;
  sourceIndex: number;
}

interface FieldRow {
  anchorY: number;
  height: number;
  fields: PositionedField[];
}

function coordinate(value: number | null): number {
  return value ?? 0;
}

function position(field: DetectedFormField, sourceIndex: number): PositionedField {
  const x0 = coordinate(field.rect[0]);
  const y0 = coordinate(field.rect[1]);
  const x1 = coordinate(field.rect[2]);
  const y1 = coordinate(field.rect[3]);
  return {
    field,
    centerX: (x0 + x1) / 2,
    centerY: (y0 + y1) / 2,
    height: Math.abs(y1 - y0),
    sourceIndex,
  };
}

function tieBreak(a: PositionedField, b: PositionedField): number {
  const idOrder = a.field.id < b.field.id ? -1 : a.field.id > b.field.id ? 1 : 0;
  return idOrder || a.sourceIndex - b.sourceIndex;
}

/**
 * Orders fields expressed in PDF page coordinates, where Y grows upward.
 * Fields whose vertical centres differ by no more than one participating
 * field height share a row. Rows run from the PDF page top downward, and
 * fields within each row run from left to right.
 */
export function orderFieldsForReading(fields: readonly DetectedFormField[]): DetectedFormField[] {
  const positioned = fields.map(position).sort(
    (a, b) => b.centerY - a.centerY || a.centerX - b.centerX || tieBreak(a, b),
  );
  const rows: FieldRow[] = [];

  for (const item of positioned) {
    const row = rows.at(-1);
    const tolerance = row === undefined ? 0 : Math.max(row.height, item.height);
    if (row === undefined || Math.abs(row.anchorY - item.centerY) > tolerance) {
      rows.push({ anchorY: item.centerY, height: item.height, fields: [item] });
      continue;
    }
    row.height = Math.max(row.height, item.height);
    row.fields.push(item);
  }

  return rows.flatMap((row) =>
    row.fields
      .sort((a, b) => a.centerX - b.centerX || b.centerY - a.centerY || tieBreak(a, b))
      .map(({ field }) => field),
  );
}

/** Returns the adjacent field in reading order, wrapping at either end. */
export function nextField(
  fields: readonly DetectedFormField[],
  currentId: string,
  direction: FieldDirection,
): DetectedFormField | null {
  const ordered = orderFieldsForReading(fields);
  if (ordered.length === 0) return null;
  const currentIndex = ordered.findIndex((field) => field.id === currentId);
  if (currentIndex === -1) return direction === "next" ? ordered[0] : ordered.at(-1) ?? null;
  const offset = direction === "next" ? 1 : -1;
  return ordered[(currentIndex + offset + ordered.length) % ordered.length];
}
