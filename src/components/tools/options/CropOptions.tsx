// Delta U: reusable Crop options panel. The workspace CropPanel drives
// this through a drag-rect overlay; the pipeline node uses the same
// schema (bbox + auto_detect + apply_to_all_pages + page_index) with
// text-driven inputs.
import { Input } from "@/components/ui/input";

export interface CropOptionsValue {
  bbox: [number, number, number, number] | null;
  auto_detect: boolean;
  apply_to_all_pages: boolean;
  page_index: number;
}

export const DEFAULT_CROP_OPTIONS: CropOptionsValue = {
  bbox: null,
  auto_detect: true,
  apply_to_all_pages: true,
  page_index: 0,
};

interface Props {
  value: CropOptionsValue;
  onChange: (next: CropOptionsValue) => void;
  mode?: "standalone" | "pipeline-node";
}

export function CropOptions({ value, onChange }: Props) {
  return (
    <div className="space-y-2 rounded border p-3 text-sm">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={value.auto_detect}
          onChange={(e) =>
            onChange({ ...value, auto_detect: e.target.checked })
          }
        />
        Auto-detect bbox
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={value.apply_to_all_pages}
          onChange={(e) =>
            onChange({ ...value, apply_to_all_pages: e.target.checked })
          }
        />
        Apply to all pages
      </label>
      <label className="block">
        Sample page index (0-based, used for auto-detect):
        <Input
          type="number"
          min={0}
          value={value.page_index}
          onChange={(e) =>
            onChange({ ...value, page_index: Number(e.target.value) })
          }
        />
      </label>
      {!value.auto_detect && (
        <div className="space-y-1">
          <p className="text-[var(--color-muted)]">
            Manual bbox x, y, w, h (PDF points):
          </p>
          <Input
            type="text"
            value={value.bbox?.join(", ") ?? ""}
            onChange={(e) => {
              const parts = e.target.value
                .split(",")
                .map((s) => Number(s.trim()));
              if (parts.length === 4 && parts.every(Number.isFinite)) {
                onChange({
                  ...value,
                  bbox: parts as [number, number, number, number],
                });
              } else {
                onChange({ ...value, bbox: null });
              }
            }}
            placeholder="36, 36, 540, 720"
          />
        </div>
      )}
    </div>
  );
}
