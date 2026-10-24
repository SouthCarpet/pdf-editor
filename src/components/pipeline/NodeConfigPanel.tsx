// Phase 14 Task 75: Pipeline NodeConfigPanel (Delta U keystone).
//
// When a node is selected on the canvas, this panel renders the SAME
// options component as the matching standalone tool, in `mode =
// "pipeline-node"`. No duplicated UI - patches the node's `data.config`
// through `usePipelineStore.setNodeConfig`.
//
// Kaliber r4 (plan 119 K3b): the panel sits on the sheet with one hairline;
// the two own forms (watermark, save) use labelled Kaliber fields and the
// shared slider, and every string comes from the pipeline catalog.
import type { ReactNode } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { FileText, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SliderField } from "@/components/tools/options/fields";
import { CompressOptions } from "@/components/tools/options/CompressOptions";
import { OptimizeOptions } from "@/components/tools/options/OptimizeOptions";
import { UnlockOptions } from "@/components/tools/options/UnlockOptions";
import { ConvertExportOptions } from "@/components/tools/options/ConvertExportOptions";
import { ConvertImportOptions } from "@/components/tools/options/ConvertImportOptions";
import { MergeOptions } from "@/components/tools/options/MergeOptions";
import { SplitOptions } from "@/components/tools/options/SplitOptions";
import { ExtractOptions } from "@/components/tools/options/ExtractOptions";
import { CropOptions } from "@/components/tools/options/CropOptions";
import { OcrOptions } from "@/components/tools/options/OcrOptions";
import {
  RotatePagesOptions,
  DeletePagesOptions,
  ReorderPagesOptions,
  InsertBlankOptions,
} from "@/components/tools/options/OrganizeOptions";
import { usePipelineStore, type PipelineEditorNode } from "@/stores/pipelineStore";
import type { NodeKindPayload } from "@/pipeline/nodeKinds";
import { translateNodeLabel } from "@/pipeline/nodeLabels";

interface Props {
  node: PipelineEditorNode;
}

export function NodeConfigPanel({ node }: Props) {
  const { t } = useTranslation("pipeline");
  const setNodeConfig = usePipelineStore((s) => s.setNodeConfig);
  const removeNode = usePipelineStore((s) => s.removeNode);

  function patch(next: NodeKindPayload) {
    setNodeConfig(node.id, next);
  }

  const config = node.data.config;

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto border-l border-[var(--color-border)] bg-[var(--color-surface-raised)] p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{translateNodeLabel(t, node.data.kind)}</h2>
        <Button variant="ghost" size="sm" onClick={() => removeNode(node.id)}>
          {t("common:remove")}
        </Button>
      </div>

      {/* Delta U: dispatch to the SAME Options component the standalone
          tool uses. mode="pipeline-node" hides the standalone-only hint. */}
      {renderOptions(config, patch)}
    </div>
  );
}

type Kind = NodeKindPayload["kind"];
type Patch = (next: NodeKindPayload) => void;
type Renderer<K extends Kind> = (
  config: Extract<NodeKindPayload, { kind: K }>,
  patch: Patch,
) => ReactNode;

const PIPELINE_NODE = "pipeline-node" as const;

// One renderer per node kind, so the dispatch stays a table lookup and the
// panel's complexity does not grow with every new kind.
const RENDERERS: { [K in Kind]: Renderer<K> } = {
  open_file: (config, patch) => <OpenFileConfig config={config} patch={patch} />,
  compress: (config, patch) => (
    <CompressOptions
      value={config.options}
      onChange={(o) => patch({ kind: "compress", options: o })}
      mode={PIPELINE_NODE}
    />
  ),
  optimize: (config, patch) => (
    <OptimizeOptions
      value={config.options}
      onChange={(o) => patch({ kind: "optimize", options: o })}
      mode={PIPELINE_NODE}
    />
  ),
  unlock: (config, patch) => (
    <UnlockOptions
      value={config.options}
      onChange={(o) => patch({ kind: "unlock", options: o })}
      mode={PIPELINE_NODE}
    />
  ),
  convert: (config, patch) => (
    <ConvertExportOptions
      value={config.options}
      onChange={(o) => patch({ kind: "convert", options: o })}
      mode={PIPELINE_NODE}
    />
  ),
  convert_import: () => <ConvertImportOptions mode={PIPELINE_NODE} />,
  merge: () => <MergeOptions mode={PIPELINE_NODE} />,
  split: (config, patch) => (
    <SplitOptions
      value={config.options}
      onChange={(o) => patch({ kind: "split", options: o })}
      mode={PIPELINE_NODE}
    />
  ),
  extract: (config, patch) => (
    <ExtractOptions
      value={config.options}
      onChange={(o) => patch({ kind: "extract", options: o })}
      mode={PIPELINE_NODE}
    />
  ),
  organize_rotate: (config, patch) => (
    <RotatePagesOptions
      value={{ rotations: config.rotations }}
      onChange={(o) => patch({ kind: "organize_rotate", rotations: o.rotations })}
      mode={PIPELINE_NODE}
    />
  ),
  organize_delete: (config, patch) => (
    <DeletePagesOptions
      value={{ pages: config.pages }}
      onChange={(o) => patch({ kind: "organize_delete", pages: o.pages })}
      mode={PIPELINE_NODE}
    />
  ),
  organize_reorder: (config, patch) => (
    <ReorderPagesOptions
      value={{ new_order: config.new_order }}
      onChange={(o) => patch({ kind: "organize_reorder", new_order: o.new_order })}
      mode={PIPELINE_NODE}
    />
  ),
  organize_insert_blank: (config, patch) => (
    <InsertBlankOptions
      value={{
        after_page_index: config.after_page_index,
        width: config.width,
        height: config.height,
      }}
      onChange={(o) =>
        patch({
          kind: "organize_insert_blank",
          after_page_index: o.after_page_index,
          width: o.width,
          height: o.height,
        })
      }
      mode={PIPELINE_NODE}
    />
  ),
  crop: (config, patch) => <CropConfig config={config} patch={patch} />,
  ocr: (config, patch) => (
    <OcrOptions
      value={{
        engine: config.engine ?? "tesseract",
        language: config.language,
        dpi: config.dpi,
        output: config.output,
        deskew: config.deskew,
        despeckle: config.despeckle,
      }}
      onChange={(o) =>
        patch({
          kind: "ocr",
          engine: o.engine,
          language: o.language,
          dpi: o.dpi,
          output: o.output,
          deskew: o.deskew,
          despeckle: o.despeckle,
        })
      }
      mode={PIPELINE_NODE}
    />
  ),
  watermark: (config, patch) => <WatermarkConfig config={config} patch={patch} />,
  save: (config, patch) => <SaveConfig config={config} patch={patch} />,
};

function renderOptions(config: NodeKindPayload, patch: Patch): ReactNode {
  // The table is indexed by the discriminant, so the entry always takes this config.
  const render = RENDERERS[config.kind] as (c: NodeKindPayload, p: Patch) => ReactNode;
  return render(config, patch);
}

type CropAspect = "free" | "1:1" | "4:3" | "16:9" | "a4-portrait" | "a4-landscape" | "letter-portrait" | "letter-landscape" | "custom";
type CropPageSize = "a3" | "a4" | "a5" | "letter" | "legal" | "tabloid" | "custom";
type CropMargin = "none" | "tight" | "standard" | "loose" | "custom";

function CropConfig({ config, patch }: KConf<"crop">) {
  return (
    <CropOptions
      value={{
        bbox: config.bbox,
        auto_detect: config.auto_detect,
        apply_to_all_pages: config.apply_to_all_pages,
        page_index: config.page_index,
        aspect_ratio: (config.aspect_ratio as CropAspect) ?? "free",
        aspect_ratio_w: config.aspect_ratio_w ?? 1,
        aspect_ratio_h: config.aspect_ratio_h ?? 1,
        page_size_preset: (config.page_size_preset as CropPageSize) ?? "custom",
        margin_preset: (config.margin_preset as CropMargin) ?? "none",
        margin_custom_mm: config.margin_custom_mm ?? 0,
        apply_to: config.apply_to ?? "all",
        apply_range: config.apply_range ?? "",
        auto_detect_threshold: config.auto_detect_threshold ?? 240,
        unit: "pt",
      }}
      onChange={(o) =>
        patch({
          kind: "crop",
          bbox: o.bbox,
          auto_detect: o.auto_detect,
          apply_to_all_pages: o.apply_to_all_pages,
          page_index: o.page_index,
          aspect_ratio: o.aspect_ratio,
          aspect_ratio_w: o.aspect_ratio_w,
          aspect_ratio_h: o.aspect_ratio_h,
          page_size_preset: o.page_size_preset,
          margin_preset: o.margin_preset,
          margin_custom_mm: o.margin_custom_mm,
          apply_to: o.apply_to,
          apply_range: o.apply_range,
          auto_detect_threshold: o.auto_detect_threshold,
        })
      }
      mode={PIPELINE_NODE}
    />
  );
}

interface KConf<K extends NodeKindPayload["kind"]> {
  config: Extract<NodeKindPayload, { kind: K }>;
  patch: (next: NodeKindPayload) => void;
}

function OpenFileConfig({ config, patch }: KConf<"open_file">) {
  const { t } = useTranslation("pipeline");

  async function pickFiles() {
    const selected = await open({
      multiple: true,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    patch({
      ...config,
      paths: Array.from(new Set([...config.paths, ...paths])),
    });
  }

  function removePath(path: string) {
    patch({ ...config, paths: config.paths.filter((item) => item !== path) });
  }

  return (
    <div className="space-y-3 text-sm">
      <p className="k-caption">{t("open_file.description")}</p>
      <Button
        variant="outline"
        className="w-full transition-transform duration-150 ease-out active:scale-[0.96]"
        onClick={pickFiles}
      >
        {t("open_file.choose")}
      </Button>
      {config.paths.length === 0 ? (
        <p className="k-caption rounded-md bg-[var(--color-surface-hover)] p-3">
          {t("open_file.empty")}
        </p>
      ) : (
        <ul className="space-y-2" aria-label={t("open_file.selected_files")}>
          {config.paths.map((path) => (
            <li
              key={path}
              className="flex min-w-0 items-center gap-2 rounded-md bg-[var(--color-surface-hover)] p-2"
            >
              <FileText className="size-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-xs" title={path}>
                {path}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 transition-transform duration-150 ease-out active:scale-[0.96]"
                aria-label={t("open_file.remove", { path })}
                onClick={() => removePath(path)}
              >
                <X className="size-4" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function WatermarkConfig({ config, patch }: KConf<"watermark">) {
  const { t } = useTranslation("pipeline");
  // The Watermark NodeKind on the Rust side is still the simplified
  // {text, opacity} pair until the font picker lands (Phase 17). The
  // full WatermarkOptions surface lives in src/components/tools/options
  // /WatermarkOptions.tsx and is ready to wire when the executor's
  // Unimplemented sentinel is replaced with a real run path.
  return (
    <div className="space-y-3 text-sm">
      <div className="k-alert k-alert--warning">
        <span className="k-mark k-mark--error k-alert-icon" aria-hidden="true" />
        <p className="k-alert-body">{t("watermark_note")}</p>
      </div>
      <label className="k-field-block">
        <span className="k-label">{t("watermark_text")}</span>
        <Input
          type="text"
          value={config.text}
          onChange={(e) => patch({ ...config, text: e.target.value })}
        />
      </label>
      <SliderField
        label={t("watermark_opacity")}
        value={Math.round(config.opacity * 100)}
        min={0}
        max={100}
        step={5}
        unit="%"
        onChange={(v) => patch({ ...config, opacity: v / 100 })}
      />
    </div>
  );
}

function SaveConfig({ config, patch }: KConf<"save">) {
  const { t } = useTranslation("pipeline");
  async function pickDir() {
    const dir = await open({ directory: true, multiple: false });
    if (dir && !Array.isArray(dir)) {
      patch({ ...config, dir });
    }
  }
  return (
    <div className="space-y-3 text-sm">
      <label className="k-field-block">
        <span className="k-label">{t("save_dir")}</span>
        <div className="flex gap-2">
          <Input
            type="text"
            value={config.dir}
            onChange={(e) => patch({ ...config, dir: e.target.value })}
            placeholder={t("save_dir_placeholder")}
          />
          <Button variant="outline" size="sm" onClick={pickDir}>
            {t("common:browse")}
          </Button>
        </div>
      </label>
      <label className="k-field-block">
        <span className="k-label">{t("save_template")}</span>
        <Input
          type="text"
          value={config.name_template}
          onChange={(e) => patch({ ...config, name_template: e.target.value })}
          placeholder="{stem}_{date}.pdf"
        />
        <span className="k-caption">{t("save_variables")}</span>
      </label>
    </div>
  );
}
