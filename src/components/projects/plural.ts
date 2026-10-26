// Count words by the plural category of the active locale (R28).
//
// Intl.PluralRules answers "one", "few" or "other" for whole numbers in en and
// sk (sk: 1 súbor, 2 až 4 súbory, 5 a viac súborov). "many" and "zero" only
// occur for fractions or other locales, so they fall back to "other".
export type CountForm = "one" | "few" | "other";

export function countForm(locale: string, count: number): CountForm {
  const category = new Intl.PluralRules(locale).select(count);
  return category === "one" || category === "few" ? category : "other";
}

export function pluralLabel(locale: string, count: number, forms: Record<CountForm, string>): string {
  return forms[countForm(locale, count)];
}
