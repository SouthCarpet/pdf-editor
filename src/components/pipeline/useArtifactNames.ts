import { useTranslation } from "react-i18next";
import type { Artifact } from "@/pipeline/preservation";

// Translated names of the PDF parts a step can remove (Delta Y warnings).
// One literal key per artifact so the i18n gate sees every call.
export function useArtifactNames() {
  const { t } = useTranslation("pipeline");
  const names: Record<Artifact, string> = {
    text_layer: t("artifacts.text_layer"),
    annotations: t("artifacts.annotations"),
    form_fields: t("artifacts.form_fields"),
    bookmarks: t("artifacts.bookmarks"),
    embedded_fonts: t("artifacts.embedded_fonts"),
    pdfa_compliance: t("artifacts.pdfa_compliance"),
    linearization: t("artifacts.linearization"),
  };
  return (list: Artifact[]) => list.map((a) => names[a]).join(", ");
}
