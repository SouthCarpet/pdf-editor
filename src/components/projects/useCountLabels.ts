import { useTranslation } from "react-i18next";
import { pluralLabel } from "./plural";

// Counted nouns for the Projects and Pipeline screens. Each noun has one key
// per plural form in both catalogs, called by literal name so the i18n gate
// sees it. The form comes from Intl.PluralRules (see plural.ts).
export function useCountLabels() {
  const { t, i18n } = useTranslation("common");
  const lng = i18n.language;
  return {
    files: (n: number) =>
      pluralLabel(lng, n, {
        one: t("projects.files_one", { count: n }),
        few: t("projects.files_few", { count: n }),
        other: t("projects.files_other", { count: n }),
      }),
    pipelines: (n: number) =>
      pluralLabel(lng, n, {
        one: t("projects.pipelines_one", { count: n }),
        few: t("projects.pipelines_few", { count: n }),
        other: t("projects.pipelines_other", { count: n }),
      }),
    projects: (n: number) =>
      pluralLabel(lng, n, {
        one: t("projects.count_one", { count: n }),
        few: t("projects.count_few", { count: n }),
        other: t("projects.count_other", { count: n }),
      }),
    steps: (n: number) =>
      pluralLabel(lng, n, {
        one: t("projects.steps_one", { count: n }),
        few: t("projects.steps_few", { count: n }),
        other: t("projects.steps_other", { count: n }),
      }),
  };
}
