// Delta U: reusable Convert Import options panel.
//
// Phase 17 Task 86a — page size selector, orientation, margins, image
// fit, and multi-image arrangement. These are advisory until the
// `image_to_pdf` service is upgraded to honor them; the form values
// survive across the FFI so a follow-up phase can wire them through.
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

export function ConvertImportOptions({ value, onChange, mode = "standalone" }: Props) {
  // Backwards-compat: in the pipeline-node case the parent currently
  // omits value/onChange. Render the legacy hint and bail out so the
  // pipeline node config keeps working until it is wired through.
  if (!value || !onChange) {
    return (
      <div className="rounded border p-3 text-sm text-[var(--color-muted)]">
        {mode === "pipeline-node"
          ? "Converts upstream non-PDF inputs (images, office docs) into PDFs via LibreOffice. No extra options."
          : "Drop images or office files. They will be merged into a single PDF via LibreOffice."}
      </div>
    );
  }
  function set<K extends keyof ConvertImportOptionsValue>(
    key: K,
    next: ConvertImportOptionsValue[K],
  ) {
    onChange!({ ...value!, [key]: next });
  }
  return (
    <div className="space-y-2 rounded border p-3 text-xs">
      <label className="block">
        Page size
        <select
          value={value.pageSize}
          onChange={(e) => set("pageSize", e.target.value as ImportPageSize)}
          className="h-7 w-full rounded border px-2"
          aria-label="Import page size"
        >
          <option value="a4">A4</option>
          <option value="letter">US Letter</option>
          <option value="legal">Legal</option>
          <option value="auto-fit">Auto-fit to image</option>
          <option value="custom">Custom</option>
        </select>
      </label>
      {value.pageSize === "custom" && (
        <div className="grid grid-cols-2 gap-1">
          <label className="block">
            Width (mm)
            <input
              type="number"
              min={10}
              value={value.customWidthMm}
              onChange={(e) =>
                set("customWidthMm", Number(e.target.value) || 210)
              }
              className="h-7 w-full rounded border px-2"
              aria-label="Custom width mm"
            />
          </label>
          <label className="block">
            Height (mm)
            <input
              type="number"
              min={10}
              value={value.customHeightMm}
              onChange={(e) =>
                set("customHeightMm", Number(e.target.value) || 297)
              }
              className="h-7 w-full rounded border px-2"
              aria-label="Custom height mm"
            />
          </label>
        </div>
      )}

      <label className="block">
        Orientation
        <select
          value={value.orientation}
          onChange={(e) =>
            set("orientation", e.target.value as ImportOrientation)
          }
          className="h-7 w-full rounded border px-2"
          aria-label="Import orientation"
        >
          <option value="portrait">Portrait</option>
          <option value="landscape">Landscape</option>
          <option value="auto">Auto</option>
        </select>
      </label>

      <label className="block">
        Margins
        <select
          value={value.margins}
          onChange={(e) => set("margins", e.target.value as ImportMargins)}
          className="h-7 w-full rounded border px-2"
          aria-label="Import margins"
        >
          <option value="none">None</option>
          <option value="10mm">10 mm</option>
          <option value="20mm">20 mm</option>
          <option value="custom">Custom</option>
        </select>
      </label>
      {value.margins === "custom" && (
        <label className="block">
          Custom margin (mm)
          <input
            type="number"
            min={0}
            value={value.customMarginMm}
            onChange={(e) =>
              set("customMarginMm", Number(e.target.value) || 0)
            }
            className="h-7 w-full rounded border px-2"
            aria-label="Custom margin mm"
          />
        </label>
      )}

      <label className="block">
        Image fit
        <select
          value={value.imageFit}
          onChange={(e) => set("imageFit", e.target.value as ImportImageFit)}
          className="h-7 w-full rounded border px-2"
          aria-label="Image fit"
        >
          <option value="fit">Fit (keep aspect)</option>
          <option value="fill">Fill (crop)</option>
          <option value="center">Center (no scaling)</option>
        </select>
      </label>

      <label className="block">
        Multi-image arrangement
        <select
          value={value.arrangement}
          onChange={(e) =>
            set("arrangement", e.target.value as ImportArrangement)
          }
          className="h-7 w-full rounded border px-2"
          aria-label="Multi-image arrangement"
        >
          <option value="one-per-page">One per page</option>
          <option value="grid-2x2">Grid 2 x 2</option>
          <option value="grid-2x3">Grid 2 x 3</option>
          <option value="custom">Custom</option>
        </select>
      </label>
    </div>
  );
}
