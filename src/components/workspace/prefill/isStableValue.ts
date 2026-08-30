const DATE_LIKE = [
  /^\d{1,2}\.\s*\d{1,2}\.\s*\d{2,4}$/,
  /^\d{1,2}\.\s*\d{1,2}\.$/,
  /^\d{1,2}\.\s*\d{1,2}$/,
  /^\d{4}-\d{1,2}-\d{1,2}$/,
  /^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/,
];

const HOURS = /^\d{1,3}$/;

/** True for values that belong on next month's copy (name, site), not dates or hours. */
export function isStableValue(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;
  if (HOURS.test(trimmed)) return false;
  return !DATE_LIKE.some((pattern) => pattern.test(trimmed));
}
