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
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import type { AnnotateMode, AnnotateOptionsValue } from "./defaults";
import { SelectField, SliderField, TextField } from "./fields";

interface Props {
  value: AnnotateOptionsValue;
  onChange: (next: AnnotateOptionsValue) => void;
  mode?: "standalone" | "pipeline-node";
}

export function AnnotateOptions({ value, onChange, mode = "standalone" }: Props) {
  const { t } = useTranslation("tools");
  return (
    <div className="space-y-4">
      <SelectField
        label="Annotation type"
        value={value.mode}
        onChange={(v) => onChange({ ...value, mode: v as AnnotateMode })}
      >
        <option value="highlight">Highlight</option>
        <option value="freetext">{t("annotate.free_text")}</option>
        <option value="square">Square / rectangle</option>
        <option value="strikethrough">Strikethrough</option>
        <option value="underline">Underline</option>
        <option value="ink">Ink (freehand)</option>
      </SelectField>
      <TextField label="Color">
        <input
          type="color"
          value={value.color}
          onChange={(e) => onChange({ ...value, color: e.target.value })}
          className="h-8 w-12"
        />
      </TextField>
      <SliderField
        label="Opacity"
        value={Math.round(value.opacity * 100)}
        min={0}
        max={100}
        step={5}
        unit="%"
        onChange={(v) => onChange({ ...value, opacity: v / 100 })}
      />
      <TextField label="Stroke width">
        <Input
          type="number"
          min={0.5}
          max={20}
          step={0.5}
          value={value.stroke_width}
          onChange={(e) => onChange({ ...value, stroke_width: Number(e.target.value) })}
        />
      </TextField>
      {mode === "pipeline-node" && (
        <TextField label="Annotations payload (JSON array)">
          <textarea
            value={value.annotations_json}
            onChange={(e) => onChange({ ...value, annotations_json: e.target.value })}
            className="k-input k-textarea h-24 w-full font-mono"
            placeholder='[{"page_index":0,"kind":"highlight",...}]'
          />
        </TextField>
      )}
    </div>
  );
}
