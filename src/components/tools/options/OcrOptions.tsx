// Delta U: reusable OCR options panel. The workspace tools/OcrTool drives
// this with i18n + a language picker tied to list_ocr_languages; the
// pipeline node embeds the same component for parity.
import { Input } from "@/components/ui/input";
import { useTranslation } from "react-i18next";
import { type OcrEngineId, useOcrBackends } from "@/hooks/useOcrBackends";
import type { OcrOptionsValue, OcrOutputMode } from "./defaults";
import { AlertNote, CheckField, SelectField, TextField } from "./fields";

interface Props {
  value: OcrOptionsValue;
  onChange: (next: OcrOptionsValue) => void;
  mode?: "standalone" | "pipeline-node";
}

export function OcrOptions({ value, onChange }: Props) {
  const { t } = useTranslation("common");
  const backends = useOcrBackends();
  const backend = backends.find((item) => item.id === value.engine);

  return (
    <div className="space-y-4">
      <SelectField
        label={t("ocr_options.engine")}
        value={value.engine}
        onChange={(v) => onChange({ ...value, engine: v as OcrEngineId, language: "eng" })}
      >
        <option value="tesseract">{t("ocr_scan.engine_tesseract")}</option>
        <option value="rapidocr">{t("ocr_scan.engine_rapidocr")}</option>
      </SelectField>
      {backend && !backend.available && (
        <AlertNote kind="warning">
          {t("ocr_scan.engine_unavailable", { engine: backend.display_name })}
        </AlertNote>
      )}
      <TextField label={t("ocr_options.language")}>
        <Input
          type="text"
          value={value.language}
          onChange={(e) => onChange({ ...value, language: e.target.value })}
          placeholder="eng"
        />
      </TextField>
      <p className="k-caption">
        {t(
          value.engine === "rapidocr"
            ? "ocr_options.language_hint_rapidocr"
            : "ocr_options.language_hint_tesseract"
        )}
      </p>
      {backend && (
        <p className="k-caption" aria-label={t("ocr_scan.languages")}>
          {backend.supported_languages.map((language) => (
            <code key={language} className="k-num mr-2">
              {language}
            </code>
          ))}
        </p>
      )}
      <TextField label={t("ocr_options.dpi")}>
        <Input
          type="number"
          min={72}
          max={600}
          step={6}
          value={value.dpi}
          onChange={(e) => onChange({ ...value, dpi: Number(e.target.value) })}
        />
      </TextField>
      <SelectField
        label={t("ocr_options.output")}
        value={value.output}
        onChange={(v) => onChange({ ...value, output: v as OcrOutputMode })}
      >
        <option value="searchable_pdf">{t("ocr_options.output_searchable")}</option>
        <option value="pdf_plus_text">{t("ocr_options.output_pdf_text")}</option>
        <option value="text_only">{t("ocr_options.output_text")}</option>
      </SelectField>
      <CheckField
        label={t("ocr_options.deskew")}
        checked={value.deskew}
        onChange={(c) => onChange({ ...value, deskew: c })}
      />
      <CheckField
        label={t("ocr_options.despeckle")}
        checked={value.despeckle}
        onChange={(c) => onChange({ ...value, despeckle: c })}
      />
    </div>
  );
}
