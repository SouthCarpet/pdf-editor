// Phase 14 Task 75: Pipeline NodeConfigPanel (Delta U keystone).
//
// When a node is selected on the canvas, this panel renders the SAME
// options component as the matching standalone tool, in `mode =
// "pipeline-node"`. No duplicated UI - patches the node's `data.config`
// through `usePipelineStore.setNodeConfig`.
import { open } from "@tauri-apps/plugin-dialog";
import { FileText, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
    <div className="flex h-full flex-col gap-3 overflow-y-auto border-l border-[var(--color-border)] bg-[var(--color-card)] p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{translateNodeLabel(t, node.data.kind)}</h2>
        <Button variant="ghost" size="sm" onClick={() => removeNode(node.id)}>
          {t("common:remove")}
        </Button>
      </div>

      {/* Delta U: dispatch to the SAME Options component the standalone
          tool uses. mode="pipeline-node" hides the standalone-only hint. */}
      {config.kind === "open_file" && <OpenFileConfig config={config} patch={patch} />}
      {config.kind === "compress" && (
        <CompressOptions
          value={config.options}
          onChange={(o) => patch({ kind: "compress", options: o })}
          mode="pipeline-node"
        />
      )}
      {config.kind === "optimize" && (
        <OptimizeOptions
          value={config.options}
          onChange={(o) => patch({ kind: "optimize", options: o })}
          mode="pipeline-node"
        />
      )}
      {config.kind === "unlock" && (
        <UnlockOptions
          value={config.options}
          onChange={(o) => patch({ kind: "unlock", options: o })}
          mode="pipeline-node"
        />
      )}
      {config.kind === "convert" && (
        <ConvertExportOptions
          value={config.options}
          onChange={(o) => patch({ kind: "convert", options: o })}
          mode="pipeline-node"
        />
      )}
      {config.kind === "convert_import" && <ConvertImportOptions mode="pipeline-node" />}
      {config.kind === "merge" && <MergeOptions mode="pipeline-node" />}
      {config.kind === "split" && (
        <SplitOptions
          value={config.options}
          onChange={(o) => patch({ kind: "split", options: o })}
          mode="pipeline-node"
        />
      )}
      {config.kind === "extract" && (
        <ExtractOptions
          value={config.options}
          onChange={(o) => patch({ kind: "extract", options: o })}
          mode="pipeline-node"
        />
      )}
      {config.kind === "organize_rotate" && (
        <RotatePagesOptions
          value={{ rotations: config.rotations }}
          onChange={(o) => patch({ kind: "organize_rotate", rotations: o.rotations })}
          mode="pipeline-node"
        />
      )}
      {config.kind === "organize_delete" && (
        <DeletePagesOptions
          value={{ pages: config.pages }}
          onChange={(o) => patch({ kind: "organize_delete", pages: o.pages })}
          mode="pipeline-node"
        />
      )}
      {config.kind === "organize_reorder" && (
        <ReorderPagesOptions
          value={{ new_order: config.new_order }}
          onChange={(o) => patch({ kind: "organize_reorder", new_order: o.new_order })}
          mode="pipeline-node"
        />
      )}
      {config.kind === "organize_insert_blank" && (
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
          mode="pipeline-node"
        />
      )}
      {config.kind === "crop" && (
        <CropOptions
          value={{
            bbox: config.bbox,
            auto_detect: config.auto_detect,
            apply_to_all_pages: config.apply_to_all_pages,
            page_index: config.page_index,
            aspect_ratio:
              (config.aspect_ratio as
                | "free"
                | "1:1"
                | "4:3"
                | "16:9"
                | "a4-portrait"
                | "a4-landscape"
                | "letter-portrait"
                | "letter-landscape"
                | "custom") ?? "free",
            aspect_ratio_w: config.aspect_ratio_w ?? 1,
            aspect_ratio_h: config.aspect_ratio_h ?? 1,
            page_size_preset:
              (config.page_size_preset as
                | "a3"
                | "a4"
                | "a5"
                | "letter"
                | "legal"
                | "tabloid"
                | "custom") ?? "custom",
            margin_preset:
              (config.margin_preset as "none" | "tight" | "standard" | "loose" | "custom") ??
              "none",
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
          mode="pipeline-node"
        />
      )}
      {config.kind === "ocr" && (
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
          mode="pipeline-node"
        />
      )}
      {config.kind === "watermark" && <WatermarkConfig config={config} patch={patch} />}
      {config.kind === "save" && <SaveConfig config={config} patch={patch} />}
    </div>
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
      <p className="text-xs text-[var(--color-muted)]">{t("open_file.description")}</p>
      <Button
        variant="outline"
        className="w-full transition-transform duration-150 ease-out active:scale-[0.96]"
        onClick={pickFiles}
      >
        {t("open_file.choose")}
      </Button>
      {config.paths.length === 0 ? (
        <p className="rounded-md bg-[var(--color-control-hover)] p-3 text-xs text-[var(--color-muted)]">
          {t("open_file.empty")}
        </p>
      ) : (
        <ul className="space-y-2" aria-label={t("open_file.selected_files")}>
          {config.paths.map((path) => (
            <li
              key={path}
              className="flex min-w-0 items-center gap-2 rounded-md bg-[var(--color-control-hover)] p-2"
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
  // The Watermark NodeKind on the Rust side is still the simplified
  // {text, opacity} pair until the font picker lands (Phase 17). The
  // full WatermarkOptions surface lives in src/components/tools/options
  // /WatermarkOptions.tsx and is ready to wire when the executor's
  // Unimplemented sentinel is replaced with a real run path.
  return (
    <div className="space-y-2 rounded border p-3 text-sm">
      <p className="rounded bg-[var(--color-warning-soft)] p-2 text-xs text-[var(--color-warning-soft-foreground)]">
        Watermark execution is unimplemented in the executor (awaits the Watermark tool font picker
        so we do not silently fall back to Standard 14). The node persists in the graph; running it
        surfaces a clear error.
      </p>
      <label className="block">
        Text:
        <Input
          type="text"
          value={config.text}
          onChange={(e) => patch({ ...config, text: e.target.value })}
        />
      </label>
      <label className="block">
        Opacity ({Math.round(config.opacity * 100)}%):
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={config.opacity}
          onChange={(e) => patch({ ...config, opacity: Number(e.target.value) })}
          className="ml-2 w-32 align-middle"
        />
      </label>
    </div>
  );
}

function SaveConfig({ config, patch }: KConf<"save">) {
  async function pickDir() {
    const dir = await open({ directory: true, multiple: false });
    if (dir && !Array.isArray(dir)) {
      patch({ ...config, dir });
    }
  }
  return (
    <div className="space-y-2 rounded border p-3 text-sm">
      <label className="block">
        Output directory:
        <div className="mt-1 flex gap-2">
          <Input
            type="text"
            value={config.dir}
            onChange={(e) => patch({ ...config, dir: e.target.value })}
            placeholder="C:\\out"
          />
          <Button variant="outline" size="sm" onClick={pickDir}>
            Browse
          </Button>
        </div>
      </label>
      <label className="block">
        Name template:
        <Input
          type="text"
          value={config.name_template}
          onChange={(e) => patch({ ...config, name_template: e.target.value })}
          placeholder="{stem}_{date}.pdf"
        />
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          Variables: {"{stem}"}, {"{i}"}, {"{date}"}, {"{tool}"}, {"{ext}"}.
        </p>
      </label>
    </div>
  );
}
