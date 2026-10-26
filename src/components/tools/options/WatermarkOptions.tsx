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
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { AlertNote, CheckField, SelectField, SliderField, TextField } from "./fields";
import type {
  WatermarkMode,
  WatermarkOptionsValue,
  WatermarkPosition,
} from "./defaults";

interface Props {
  value: WatermarkOptionsValue;
  onChange: (next: WatermarkOptionsValue) => void;
  mode?: "standalone" | "pipeline-node";
}

export function WatermarkOptions({ value, onChange, mode = "standalone" }: Props) {
  const { t } = useTranslation("tools");
  return (
    <div className="space-y-4">
      {mode === "pipeline-node" && (
        <AlertNote kind="warning">{t("watermark.pipeline_note")}</AlertNote>
      )}
      <SelectField
        label="Mode"
        value={value.watermark_mode}
        onChange={(v) => onChange({ ...value, watermark_mode: v as WatermarkMode })}
      >
        <option value="text">Text</option>
        <option value="image">Image</option>
      </SelectField>
      {value.watermark_mode === "text" ? (
        <>
          <TextField label="Text">
            <Input
              type="text"
              value={value.text}
              onChange={(e) => onChange({ ...value, text: e.target.value })}
              placeholder={t("watermark.text_placeholder")}
            />
          </TextField>
          <TextField label="Font family">
            <Input
              type="text"
              value={value.font_family}
              onChange={(e) => onChange({ ...value, font_family: e.target.value })}
              placeholder={t("watermark.font_placeholder")}
            />
          </TextField>
          <TextField label="Font size">
            <Input
              type="number"
              min={6}
              max={300}
              value={value.font_size}
              onChange={(e) => onChange({ ...value, font_size: Number(e.target.value) })}
            />
          </TextField>
          <TextField label="Color">
            <input
              type="color"
              value={value.color}
              onChange={(e) => onChange({ ...value, color: e.target.value })}
              className="h-8 w-12"
            />
          </TextField>
        </>
      ) : (
        <TextField label="Image path">
          <Input
            type="text"
            value={value.image_path ?? ""}
            onChange={(e) => onChange({ ...value, image_path: e.target.value || null })}
            placeholder={t("watermark.image_placeholder")}
          />
        </TextField>
      )}
      <SliderField
        label="Opacity"
        value={Math.round(value.opacity * 100)}
        min={0}
        max={100}
        step={5}
        unit="%"
        onChange={(v) => onChange({ ...value, opacity: v / 100 })}
      />
      <TextField label="Rotation">
        <Input
          type="number"
          min={-90}
          max={90}
          value={value.rotation}
          onChange={(e) => onChange({ ...value, rotation: Number(e.target.value) })}
        />
      </TextField>
      <SelectField
        label="Position"
        value={value.position}
        onChange={(v) => onChange({ ...value, position: v as WatermarkPosition })}
      >
        <option value="top_left">{t("watermark.position_top_left")}</option>
        <option value="top_center">{t("watermark.position_top_center")}</option>
        <option value="top_right">{t("watermark.position_top_right")}</option>
        <option value="middle_left">{t("watermark.position_middle_left")}</option>
        <option value="center">{t("watermark.position_center")}</option>
        <option value="middle_right">{t("watermark.position_middle_right")}</option>
        <option value="bottom_left">{t("watermark.position_bottom_left")}</option>
        <option value="bottom_center">{t("watermark.position_bottom_center")}</option>
        <option value="bottom_right">{t("watermark.position_bottom_right")}</option>
      </SelectField>
      <TextField
        label={
          <>
            Pages (e.g. <code>all</code>, <code>1-5</code>, <code>1,3,5</code>)
          </>
        }
      >
        <Input
          type="text"
          value={value.page_range}
          onChange={(e) => onChange({ ...value, page_range: e.target.value })}
          placeholder={t("watermark.pages_placeholder")}
        />
      </TextField>
      <CheckField
        label="Place behind page content"
        checked={value.behind_text}
        onChange={(c) => onChange({ ...value, behind_text: c })}
      />
    </div>
  );
}
