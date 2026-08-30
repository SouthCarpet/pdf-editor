import type { ShortcutBinding, ShortcutGroup } from "./shortcuts";

export const SHORTCUT_GROUP_ORDER: readonly ShortcutGroup[] = [
  "navigation",
  "forms",
  "edit",
  "view",
  "file",
];

const KEY_NAMES: Readonly<Record<string, string>> = {
  PageUp: "PgUp",
  PageDown: "PgDn",
  Escape: "Esc",
  NumpadAdd: "Num +",
  NumpadSubtract: "Num -",
};

/** Produces display tokens only from a registered row. Plus and slash tokens
 * are separators; every other token is rendered as a key chip. */
export function formatKeys(row: ShortcutBinding): string[] {
  const modifiers = [
    ...(row.modifier === "ctrl" ? ["Ctrl"] : []),
    ...(row.shift === true ? ["Shift"] : []),
  ];
  const alternatives = [...row.keys, ...(row.codes ?? [])].map(
    (key) => KEY_NAMES[key] ?? (key.length === 1 ? key.toUpperCase() : key),
  );
  const tokens: string[] = [];
  for (const modifier of modifiers) {
    if (tokens.length > 0) tokens.push("+");
    tokens.push(modifier);
  }
  if (tokens.length > 0) tokens.push("+");
  alternatives.forEach((key, index) => {
    if (index > 0) tokens.push("/");
    tokens.push(key);
  });
  return tokens;
}

export function shortcutTranslationKey(row: ShortcutBinding): string {
  return row.labelKey.includes(":") ? row.labelKey : `workspace:${row.labelKey}`;
}
