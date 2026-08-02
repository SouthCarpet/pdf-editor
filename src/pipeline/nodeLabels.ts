import type { TFunction } from "i18next";
import type { NodeKindKey } from "./nodeKinds";

export function translateNodeLabel(t: TFunction, key: NodeKindKey): string {
  switch (key) {
    case "open_file":
      return t("pipeline:nodes.open_file");
    case "merge":
      return t("common:tools.merge");
    case "convert_import":
      return t("common:tools.convert_import");
    case "compress":
      return t("common:tools.compress");
    case "optimize":
      return t("common:tools.optimize");
    case "unlock":
      return t("common:tools.unlock");
    case "split":
      return t("common:tools.split");
    case "extract":
      return t("common:tools.extract");
    case "crop":
      return t("common:tools.crop");
    case "organize_rotate":
      return t("tools:organize.rotate");
    case "organize_delete":
      return t("tools:organize.delete_pages");
    case "organize_reorder":
      return t("tools:organize.reorder");
    case "organize_insert_blank":
      return t("tools:organize.insert_blank");
    case "ocr":
      return t("common:tools.ocr");
    case "convert":
      return t("common:tools.convert_export");
    case "watermark":
      return t("pipeline:nodes.watermark");
    case "save":
      return t("common:save");
  }
}
