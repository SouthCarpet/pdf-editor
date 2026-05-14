// Delta U: reusable Annotate options panel.
//
// The workspace EditAnnotationsPanel exposes the full mode selector +
// per-mode controls (highlight / freetext / square / strikethrough /
// underline / ink). The pipeline node version captures the SAME mode
// choice + a free-text "annotations spec" textarea (JSON) so a preset
// can encode pre-defined annotations to apply.
//
// The pipeline executor does not yet ship an Annotate node (the
// standalone tool is the canonical entry point); this component exists
// so the Option surface is ready when Phase 17 wires it.
import { Input } from "@/components/ui/input";
import type { AnnotateMode, AnnotateOptionsValue } from "./defaults";

interface Props {
  value: AnnotateOptionsValue;
  onChange: (next: AnnotateOptionsValue) => void;
  mode?: "standalone" | "pipeline-node";
}

export function AnnotateOptions({ value, onChange, mode = "standalone" }: Props) {
  return (
    <div className="space-y-2 rounded border p-3 text-sm">
      <label className="block">
        Annotation type:
        <select
          value={value.mode}
          onChange={(e) =>
            onChange({ ...value, mode: e.target.value as AnnotateMode })
          }
          className="ml-2 h-8 rounded border px-2"
        >
          <option value="highlight">Highlight</option>
          <option value="freetext">Free text</option>
          <option value="square">Square / rectangle</option>
          <option value="strikethrough">Strikethrough</option>
          <option value="underline">Underline</option>
          <option value="ink">Ink (freehand)</option>
        </select>
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
        Stroke width:
        <Input
          type="number"
          min={0.5}
          max={20}
          step={0.5}
          value={value.stroke_width}
          onChange={(e) =>
            onChange({ ...value, stroke_width: Number(e.target.value) })
          }
        />
      </label>
      {mode === "pipeline-node" && (
        <label className="block">
          Annotations payload (JSON array):
          <textarea
            value={value.annotations_json}
            onChange={(e) =>
              onChange({ ...value, annotations_json: e.target.value })
            }
            className="mt-1 h-24 w-full rounded border p-2 font-mono text-xs"
            placeholder='[{"page_index":0,"kind":"highlight",...}]'
          />
        </label>
      )}
    </div>
  );
}
