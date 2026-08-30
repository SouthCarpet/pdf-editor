import type { DetectedFormField } from "@/bindings";
import type { PrefillRecord } from "@/stores/prefillStore";
import { isStableValue } from "./isStableValue";
import { fieldPositionKey } from "./templateHash";

/** Field-id → last-fill text to apply. Dates, hours, empty, and already-filled fields are omitted. */
export function prefillOffer(
  record: PrefillRecord | null | undefined,
  fields: readonly DetectedFormField[],
  filledIds: ReadonlySet<string>,
): Record<string, string> {
  if (record === null || record === undefined) return {};
  const values: Record<string, string> = {};
  for (const field of fields) {
    if (filledIds.has(field.id)) continue;
    const text = record.values[fieldPositionKey(field)];
    if (text === undefined || !isStableValue(text)) continue;
    values[field.id] = text;
  }
  return values;
}

export function shouldShowPrefillBanner({
  record,
  fields,
  filledIds,
  dismissed,
}: {
  record: PrefillRecord | null | undefined;
  fields: readonly DetectedFormField[];
  filledIds: ReadonlySet<string>;
  dismissed: boolean;
}): boolean {
  if (dismissed) return false;
  return Object.keys(prefillOffer(record, fields, filledIds)).length > 0;
}

export function formatPrefillDate(savedAt: number, language: string): string {
  const locale = language.startsWith("sk") ? "sk-SK" : "en-GB";
  return new Date(savedAt).toLocaleDateString(locale, {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  });
}
