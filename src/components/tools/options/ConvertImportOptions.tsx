// Delta U: reusable Convert Import options panel.
//
// Phase 17 Task 86a - page size selector, orientation, margins, image
// fit, and multi-image arrangement. These are advisory until the
// `image_to_pdf` service is upgraded to honor them; the form values
// survive across the FFI so a follow-up phase can wire them through.
import { useTranslation } from "react-i18next";
import { SelectField, TextField } from "./fields";
import type {
  ConvertImportOptionsValue,
  ImportArrangement,
  ImportImageFit,
  ImportMargins,
  ImportOrientation,
  ImportPageSize,
} from "./defaults";
export { DEFAULT_CONVERT_IMPORT_OPTIONS } from "./defaults";
export type { ConvertImportOptionsValue } from "./defaults";

interface Props {
  value?: ConvertImportOptionsValue;
  onChange?: (next: ConvertImportOptionsValue) => void;
  mode?: "standalone" | "pipeline-node";
}

type Setter = <K extends keyof ConvertImportOptionsValue>(
  key: K,
  next: ConvertImportOptionsValue[K]
) => void;

interface SectionProps {
  value: ConvertImportOptionsValue;
  set: Setter;
}

function NumberField({
  label,
  value,
  min,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  onChange: (next: number) => void;
}) {
  return (
    <TextField label={label}>
      <input
        type="number"
        className="k-input"
        min={min}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
      />
    </TextField>
  );
}

function PageSizeSection({ value, set }: SectionProps) {
  return (
    <>
      <SelectField
        label="Page size"
        value={value.pageSize}
        onChange={(v) => set("pageSize", v as ImportPageSize)}
      >
        <option value="a4">A4</option>
        <option value="letter">US Letter</option>
        <option value="legal">Legal</option>
        <option value="auto-fit">Auto-fit to image</option>
        <option value="custom">Custom</option>
      </SelectField>
      {value.pageSize === "custom" && (
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="Width (mm)"
            min={10}
            value={value.customWidthMm}
            onChange={(n) => set("customWidthMm", n || 210)}
          />
          <NumberField
            label="Height (mm)"
            min={10}
            value={value.customHeightMm}
            onChange={(n) => set("customHeightMm", n || 297)}
          />
        </div>
      )}
    </>
  );
}

function MarginSection({ value, set }: SectionProps) {
  return (
    <>
      <SelectField
        label="Margins"
        value={value.margins}
        onChange={(v) => set("margins", v as ImportMargins)}
      >
        <option value="none">None</option>
        <option value="10mm">10 mm</option>
        <option value="20mm">20 mm</option>
        <option value="custom">Custom</option>
      </SelectField>
      {value.margins === "custom" && (
        <NumberField
          label="Custom margin (mm)"
          min={0}
          value={value.customMarginMm}
          onChange={(n) => set("customMarginMm", n || 0)}
        />
      )}
    </>
  );
}

export function ConvertImportOptions({ value, onChange, mode = "standalone" }: Props) {
  const { t } = useTranslation("tools");
  // Backwards-compat: in the pipeline-node case the parent currently
  // omits value/onChange. Render the legacy hint and bail out so the
  // pipeline node config keeps working until it is wired through.
  if (!value || !onChange) {
    return (
      <p className="k-caption">
        {mode === "pipeline-node"
          ? "Converts upstream non-PDF inputs (images, office docs) into PDFs via LibreOffice. No extra options."
          : "Drop images or office files. They will be merged into a single PDF via LibreOffice."}
      </p>
    );
  }
  const set: Setter = (key, next) => onChange({ ...value, [key]: next });
  return (
    <div className="space-y-4">
      <PageSizeSection value={value} set={set} />
      <SelectField
        label="Orientation"
        value={value.orientation}
        onChange={(v) => set("orientation", v as ImportOrientation)}
      >
        <option value="portrait">Portrait</option>
        <option value="landscape">Landscape</option>
        <option value="auto">Auto</option>
      </SelectField>
      <MarginSection value={value} set={set} />
      <SelectField
        label="Image fit"
        value={value.imageFit}
        onChange={(v) => set("imageFit", v as ImportImageFit)}
      >
        <option value="fit">Fit (keep aspect)</option>
        <option value="fill">Fill (crop)</option>
        <option value="center">Center (no scaling)</option>
      </SelectField>
      <SelectField
        label="Multi-image arrangement"
        value={value.arrangement}
        onChange={(v) => set("arrangement", v as ImportArrangement)}
      >
        <option value="one-per-page">{t("convert_import.one_per_page")}</option>
        <option value="grid-2x2">Grid 2 x 2</option>
        <option value="grid-2x3">Grid 2 x 3</option>
        <option value="custom">Custom</option>
      </SelectField>
    </div>
  );
}
