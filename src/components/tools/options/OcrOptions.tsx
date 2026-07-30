// Delta U: reusable OCR options panel. The workspace tools/OcrTool drives
// this with i18n + a language picker tied to list_ocr_languages; the
// pipeline node embeds the same component for parity.
import { Input } from "@/components/ui/input";
import { useTranslation } from "react-i18next";
import { type OcrEngineId, useOcrBackends } from "@/hooks/useOcrBackends";
import type { OcrOptionsValue, OcrOutputMode } from "./defaults";

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
    <div className="space-y-2 rounded border p-3 text-sm">
      <label className="block">
        {t("ocr_options.engine")}
        <select
          value={value.engine}
          onChange={(event) =>
            onChange({
              ...value,
              engine: event.target.value as OcrEngineId,
              language: "eng",
            })
          }
          className="mt-1 block h-9 w-full rounded border border-[var(--color-border)] bg-[var(--color-card)] px-2"
        >
          <option value="tesseract">{t("ocr_scan.engine_tesseract")}</option>
          <option value="rapidocr">{t("ocr_scan.engine_rapidocr")}</option>
        </select>
      </label>
      {backend && !backend.available && (
        <p className="rounded border border-[var(--color-warning)] bg-[var(--color-warning-soft)] px-2 py-1.5 text-xs text-[var(--color-warning-soft-foreground)]">
          {t("ocr_scan.engine_unavailable", { engine: backend.display_name })}
        </p>
      )}
      <label className="block">
        {t("ocr_options.language")}
        <Input
          type="text"
          value={value.language}
          onChange={(e) => onChange({ ...value, language: e.target.value })}
          placeholder="eng"
        />
      </label>
      <p className="text-xs text-[var(--color-muted)]">
        {t(
          value.engine === "rapidocr"
            ? "ocr_options.language_hint_rapidocr"
            : "ocr_options.language_hint_tesseract"
        )}
      </p>
      {backend && (
        <div className="flex flex-wrap gap-1" aria-label={t("ocr_scan.languages")}>
          {backend.supported_languages.map((language) => (
            <code
              key={language}
              className="rounded border border-[var(--color-border)] bg-[var(--color-card)] px-1.5 py-0.5 text-xs"
            >
              {language}
            </code>
          ))}
        </div>
      )}
      <label className="block">
        {t("ocr_options.dpi")}
        <Input
          type="number"
          min={72}
          max={600}
          step={6}
          value={value.dpi}
          onChange={(e) => onChange({ ...value, dpi: Number(e.target.value) })}
        />
      </label>
      <label className="block">
        {t("ocr_options.output")}
        <select
          value={value.output}
          onChange={(e) => onChange({ ...value, output: e.target.value as OcrOutputMode })}
          className="ml-2 h-8 rounded border px-2"
        >
          <option value="searchable_pdf">{t("ocr_options.output_searchable")}</option>
          <option value="pdf_plus_text">{t("ocr_options.output_pdf_text")}</option>
          <option value="text_only">{t("ocr_options.output_text")}</option>
        </select>
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={value.deskew}
          onChange={(e) => onChange({ ...value, deskew: e.target.checked })}
        />
        {t("ocr_options.deskew")}
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={value.despeckle}
          onChange={(e) => onChange({ ...value, despeckle: e.target.checked })}
        />
        {t("ocr_options.despeckle")}
      </label>
    </div>
  );
}
