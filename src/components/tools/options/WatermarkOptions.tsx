// Delta U: reusable Watermark options panel.
//
// The standalone Watermark tool has not shipped yet; per Delta W rule
// #1 (no hardcoded fonts in PDF output) and the Phase 14 executor
// surfacing Unimplemented for Watermark, this component captures the
// FULL option surface from the plan (text/image mode, style, position,
// opacity, rotation, page range) so the form is ready when the
// executor's font picker lands.
//
// Until then, NodeConfigPanel renders the form but the executor errors
// with AppError::Unimplemented at run time.
import { Input } from "@/components/ui/input";

export type WatermarkMode = "text" | "image";
export type WatermarkPosition =
  | "top_left"
  | "top_center"
  | "top_right"
  | "middle_left"
  | "center"
  | "middle_right"
  | "bottom_left"
  | "bottom_center"
  | "bottom_right";

export interface WatermarkOptionsValue {
  watermark_mode: WatermarkMode;
  text: string;
  image_path: string | null;
  font_family: string;
  font_size: number;
  color: string;
  opacity: number;
  rotation: number;
  position: WatermarkPosition;
  /// "all" | "current" | "1-5,7"
  page_range: string;
  /// behind page content vs on top of page content
  behind_text: boolean;
}

export const DEFAULT_WATERMARK_OPTIONS: WatermarkOptionsValue = {
  watermark_mode: "text",
  text: "DRAFT",
  image_path: null,
  font_family: "Arial",
  font_size: 48,
  color: "#888888",
  opacity: 0.4,
  rotation: -45,
  position: "center",
  page_range: "all",
  behind_text: false,
};

interface Props {
  value: WatermarkOptionsValue;
  onChange: (next: WatermarkOptionsValue) => void;
  mode?: "standalone" | "pipeline-node";
}

export function WatermarkOptions({ value, onChange, mode = "standalone" }: Props) {
  return (
    <div className="space-y-2 rounded border p-3 text-sm">
      {mode === "pipeline-node" && (
        <p className="rounded bg-amber-50 p-2 text-xs text-amber-800">
          Watermark execution is unimplemented in the pipeline executor
          (awaits the standalone Watermark tool's font picker). The node
          persists in the graph; running it surfaces a clear error.
        </p>
      )}
      <label className="block">
        Mode:
        <select
          value={value.watermark_mode}
          onChange={(e) =>
            onChange({ ...value, watermark_mode: e.target.value as WatermarkMode })
          }
          className="ml-2 h-8 rounded border px-2"
        >
          <option value="text">Text</option>
          <option value="image">Image</option>
        </select>
      </label>
      {value.watermark_mode === "text" ? (
        <>
          <label className="block">
            Text:
            <Input
              type="text"
              value={value.text}
              onChange={(e) => onChange({ ...value, text: e.target.value })}
              placeholder="DRAFT"
            />
          </label>
          <label className="block">
            Font family:
            <Input
              type="text"
              value={value.font_family}
              onChange={(e) =>
                onChange({ ...value, font_family: e.target.value })
              }
              placeholder="Arial"
            />
          </label>
          <label className="block">
            Font size:
            <Input
              type="number"
              min={6}
              max={300}
              value={value.font_size}
              onChange={(e) =>
                onChange({ ...value, font_size: Number(e.target.value) })
              }
            />
          </label>
          <label className="block">
            Color:
            <input
              type="color"
              value={value.color}
              onChange={(e) => onChange({ ...value, color: e.target.value })}
              className="ml-2 h-8 w-12 align-middle"
            />
          </label>
        </>
      ) : (
        <label className="block">
          Image path:
          <Input
            type="text"
            value={value.image_path ?? ""}
            onChange={(e) =>
              onChange({ ...value, image_path: e.target.value || null })
            }
            placeholder="C:\\path\\to\\watermark.png"
          />
        </label>
      )}
      <label className="block">
        Opacity ({Math.round(value.opacity * 100)}%):
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={value.opacity}
          onChange={(e) =>
            onChange({ ...value, opacity: Number(e.target.value) })
          }
          className="ml-2 w-32 align-middle"
        />
      </label>
      <label className="block">
        Rotation:
        <Input
          type="number"
          min={-90}
          max={90}
          value={value.rotation}
          onChange={(e) =>
            onChange({ ...value, rotation: Number(e.target.value) })
          }
        />
      </label>
      <label className="block">
        Position:
        <select
          value={value.position}
          onChange={(e) =>
            onChange({ ...value, position: e.target.value as WatermarkPosition })
          }
          className="ml-2 h-8 rounded border px-2"
        >
          <option value="top_left">Top left</option>
          <option value="top_center">Top center</option>
          <option value="top_right">Top right</option>
          <option value="middle_left">Middle left</option>
          <option value="center">Center</option>
          <option value="middle_right">Middle right</option>
          <option value="bottom_left">Bottom left</option>
          <option value="bottom_center">Bottom center</option>
          <option value="bottom_right">Bottom right</option>
        </select>
      </label>
      <label className="block">
        Pages (e.g. <code>all</code>, <code>1-5</code>, <code>1,3,5</code>):
        <Input
          type="text"
          value={value.page_range}
          onChange={(e) =>
            onChange({ ...value, page_range: e.target.value })
          }
          placeholder="all"
        />
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={value.behind_text}
          onChange={(e) =>
            onChange({ ...value, behind_text: e.target.checked })
          }
        />
        Place behind page content
      </label>
    </div>
  );
}
