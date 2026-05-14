// Phase 14 — frontend NodeKind definitions.
//
// Mirrors `src-tauri/src/pipeline/dag.rs::NodeKind`. The `type` discriminant
// must match the snake_case Rust serde tag verbatim — the Rust executor
// dispatches on it after `serde_json` deserializes the pipeline payload.

import type { CompressOptionsValue } from "@/components/tools/options/CompressOptions";
import { DEFAULT_COMPRESS_OPTIONS } from "@/components/tools/options/CompressOptions";
import type { OptimizeOptionsValue } from "@/components/tools/options/OptimizeOptions";
import { DEFAULT_OPTIMIZE_OPTIONS } from "@/components/tools/options/OptimizeOptions";
import type { UnlockOptionsValue } from "@/components/tools/options/UnlockOptions";
import { DEFAULT_UNLOCK_OPTIONS } from "@/components/tools/options/UnlockOptions";
import type { ConvertExportOptionsValue } from "@/components/tools/options/ConvertExportOptions";
import { DEFAULT_CONVERT_EXPORT_OPTIONS } from "@/components/tools/options/ConvertExportOptions";
import type { SplitOptionsValue } from "@/components/tools/options/SplitOptions";
import { DEFAULT_SPLIT_OPTIONS } from "@/components/tools/options/SplitOptions";
import type { ExtractOptionsValue } from "@/components/tools/options/ExtractOptions";
import { DEFAULT_EXTRACT_OPTIONS } from "@/components/tools/options/ExtractOptions";

export type NodeKindKey =
  | "compress"
  | "optimize"
  | "unlock"
  | "convert"
  | "convert_import"
  | "merge"
  | "split"
  | "extract"
  | "organize_rotate"
  | "organize_delete"
  | "organize_reorder"
  | "organize_insert_blank"
  | "crop"
  | "ocr"
  | "watermark"
  | "save";

// One union member per NodeKind. The shape is what gets sent to the Rust
// `Pipeline` payload (after a thin transform in toPipelinePayload below).
export type NodeKindPayload =
  | { kind: "compress"; options: CompressOptionsValue }
  | { kind: "optimize"; options: OptimizeOptionsValue }
  | { kind: "unlock"; options: UnlockOptionsValue }
  | { kind: "convert"; options: ConvertExportOptionsValue; out_dir?: string }
  | { kind: "convert_import"; extra_inputs: string[] }
  | { kind: "merge" }
  | { kind: "split"; options: SplitOptionsValue }
  | { kind: "extract"; options: ExtractOptionsValue }
  | { kind: "organize_rotate"; rotations: Array<[number, number]> }
  | { kind: "organize_delete"; pages: number[] }
  | { kind: "organize_reorder"; new_order: number[] }
  | {
      kind: "organize_insert_blank";
      after_page_index: number;
      width: number;
      height: number;
    }
  | {
      kind: "crop";
      bbox: [number, number, number, number] | null;
      auto_detect: boolean;
      apply_to_all_pages: boolean;
      page_index: number;
    }
  | {
      kind: "ocr";
      language: string;
      dpi: number;
      output: "searchable_pdf" | "pdf_plus_text" | "text_only";
      deskew: boolean;
      despeckle: boolean;
    }
  | { kind: "watermark"; text: string; opacity: number }
  | { kind: "save"; dir: string; name_template: string };

export interface NodeKindMeta {
  key: NodeKindKey;
  label: string;
  category: "input" | "modify" | "convert" | "output";
  defaultPayload: () => NodeKindPayload;
  summary: (payload: NodeKindPayload) => string;
}

export const NODE_KINDS: NodeKindMeta[] = [
  {
    key: "merge",
    label: "Merge",
    category: "input",
    defaultPayload: () => ({ kind: "merge" }),
    summary: () => "all inputs -> one PDF",
  },
  {
    key: "convert_import",
    label: "Convert (to PDF)",
    category: "input",
    defaultPayload: () => ({ kind: "convert_import", extra_inputs: [] }),
    summary: () => "non-PDF inputs -> PDF",
  },
  {
    key: "compress",
    label: "Compress",
    category: "modify",
    defaultPayload: () => ({
      kind: "compress",
      options: DEFAULT_COMPRESS_OPTIONS,
    }),
    summary: (p) =>
      p.kind === "compress" ? `preset: ${p.options.preset}` : "",
  },
  {
    key: "optimize",
    label: "Optimize",
    category: "modify",
    defaultPayload: () => ({
      kind: "optimize",
      options: DEFAULT_OPTIMIZE_OPTIONS,
    }),
    summary: (p) =>
      p.kind === "optimize"
        ? [
            p.options.linearize && "linearize",
            p.options.subset_fonts && "subset",
            p.options.object_streams && "object streams",
            p.options.pdfa && `PDF/A v${p.options.pdfa_version}`,
          ]
            .filter(Boolean)
            .join(", ") || "no options"
        : "",
  },
  {
    key: "unlock",
    label: "Unlock",
    category: "modify",
    defaultPayload: () => ({
      kind: "unlock",
      options: DEFAULT_UNLOCK_OPTIONS,
    }),
    summary: (p) =>
      p.kind === "unlock"
        ? p.options.password
          ? "password set"
          : "(try without password)"
        : "",
  },
  {
    key: "split",
    label: "Split",
    category: "modify",
    defaultPayload: () => ({
      kind: "split",
      options: DEFAULT_SPLIT_OPTIONS,
    }),
    summary: (p) =>
      p.kind === "split"
        ? `${p.options.ranges.length} range${p.options.ranges.length === 1 ? "" : "s"}`
        : "",
  },
  {
    key: "extract",
    label: "Extract",
    category: "modify",
    defaultPayload: () => ({
      kind: "extract",
      options: DEFAULT_EXTRACT_OPTIONS,
    }),
    summary: (p) =>
      p.kind === "extract" ? `pages: ${p.options.pageInput}` : "",
  },
  {
    key: "crop",
    label: "Crop",
    category: "modify",
    defaultPayload: () => ({
      kind: "crop",
      bbox: null,
      auto_detect: true,
      apply_to_all_pages: true,
      page_index: 0,
    }),
    summary: (p) =>
      p.kind === "crop"
        ? p.auto_detect
          ? "auto-detect"
          : p.bbox
            ? `bbox ${p.bbox.map((n) => n.toFixed(0)).join(", ")}`
            : "(no bbox)"
        : "",
  },
  {
    key: "organize_rotate",
    label: "Rotate pages",
    category: "modify",
    defaultPayload: () => ({ kind: "organize_rotate", rotations: [] }),
    summary: (p) =>
      p.kind === "organize_rotate"
        ? `${p.rotations.length} rotation${p.rotations.length === 1 ? "" : "s"}`
        : "",
  },
  {
    key: "organize_delete",
    label: "Delete pages",
    category: "modify",
    defaultPayload: () => ({ kind: "organize_delete", pages: [] }),
    summary: (p) =>
      p.kind === "organize_delete"
        ? `${p.pages.length} page${p.pages.length === 1 ? "" : "s"}`
        : "",
  },
  {
    key: "organize_reorder",
    label: "Reorder pages",
    category: "modify",
    defaultPayload: () => ({ kind: "organize_reorder", new_order: [] }),
    summary: (p) =>
      p.kind === "organize_reorder"
        ? `order [${p.new_order.slice(0, 5).join(", ")}${p.new_order.length > 5 ? ", ..." : ""}]`
        : "",
  },
  {
    key: "organize_insert_blank",
    label: "Insert blank page",
    category: "modify",
    defaultPayload: () => ({
      kind: "organize_insert_blank",
      after_page_index: 0,
      width: 612,
      height: 792,
    }),
    summary: (p) =>
      p.kind === "organize_insert_blank"
        ? `after page ${p.after_page_index + 1} (${p.width.toFixed(0)} x ${p.height.toFixed(0)} pt)`
        : "",
  },
  {
    key: "ocr",
    label: "OCR",
    category: "modify",
    defaultPayload: () => ({
      kind: "ocr",
      language: "eng",
      dpi: 300,
      output: "searchable_pdf",
      deskew: true,
      despeckle: false,
    }),
    summary: (p) =>
      p.kind === "ocr"
        ? `${p.language} @ ${p.dpi} DPI (${p.output})`
        : "",
  },
  {
    key: "convert",
    label: "Convert (export)",
    category: "convert",
    defaultPayload: () => ({
      kind: "convert",
      options: DEFAULT_CONVERT_EXPORT_OPTIONS,
    }),
    summary: (p) => (p.kind === "convert" ? `-> ${p.options.format}` : ""),
  },
  {
    key: "watermark",
    label: "Watermark",
    category: "modify",
    defaultPayload: () => ({ kind: "watermark", text: "DRAFT", opacity: 0.4 }),
    summary: (p) =>
      p.kind === "watermark"
        ? `"${p.text}" @ ${Math.round(p.opacity * 100)}%`
        : "",
  },
  {
    key: "save",
    label: "Save",
    category: "output",
    defaultPayload: () => ({
      kind: "save",
      dir: "",
      name_template: "{stem}_processed.pdf",
    }),
    summary: (p) =>
      p.kind === "save"
        ? p.dir
          ? `${p.dir} / ${p.name_template}`
          : "(no dir)"
        : "",
  },
];

export function nodeKindByKey(key: NodeKindKey): NodeKindMeta {
  const m = NODE_KINDS.find((k) => k.key === key);
  if (!m) throw new Error(`unknown NodeKind: ${key}`);
  return m;
}

/**
 * Serialise a payload from the editor's shape into the Rust DAG's shape.
 * The Rust side uses snake_case keys and the `type` tag on each variant
 * (see `pipeline::dag::NodeKind`).
 */
export function payloadToRust(
  payload: NodeKindPayload,
): Record<string, unknown> {
  switch (payload.kind) {
    case "compress":
      return {
        type: "compress",
        preset:
          payload.options.preset === "custom"
            ? "custom"
            : payload.options.preset,
        custom_quality:
          payload.options.preset === "custom" ? payload.options.customQuality : null,
        custom_dpi:
          payload.options.preset === "custom" ? payload.options.customDpi : null,
      };
    case "optimize":
      return {
        type: "optimize",
        linearize: payload.options.linearize,
        remove_unused: payload.options.remove_unused,
        subset_fonts: payload.options.subset_fonts,
        object_streams: payload.options.object_streams,
        strip_metadata: payload.options.strip_metadata,
        flatten_annotations: payload.options.flatten_annotations,
        remove_form_data: payload.options.remove_form_data,
        make_searchable_ocr: payload.options.ocr ? payload.options.ocr_lang : null,
        convert_pdfa: payload.options.pdfa ? payload.options.pdfa_version : null,
      };
    case "unlock":
      return {
        type: "unlock",
        password: payload.options.password || null,
      };
    case "convert":
      return {
        type: "convert",
        format: payload.options.format,
        out_dir: payload.out_dir ?? null,
      };
    case "convert_import":
      return {
        type: "convert_import",
        extra_inputs: payload.extra_inputs,
      };
    case "merge":
      return { type: "merge" };
    case "split":
      return {
        type: "split",
        ranges: payload.options.ranges.map((r) => [r.from, r.to]),
      };
    case "extract": {
      // Parse the page input into an array of u32s; pipeline-side errors
      // if the input is invalid.
      const list = parsePageInput(payload.options.pageInput);
      return { type: "extract", pages: list };
    }
    case "organize_rotate":
      return { type: "organize_rotate", rotations: payload.rotations };
    case "organize_delete":
      return { type: "organize_delete", pages: payload.pages };
    case "organize_reorder":
      return { type: "organize_reorder", new_order: payload.new_order };
    case "organize_insert_blank":
      return {
        type: "organize_insert_blank",
        after_page_index: payload.after_page_index,
        width: payload.width,
        height: payload.height,
      };
    case "crop":
      return {
        type: "crop",
        bbox: payload.bbox,
        auto_detect: payload.auto_detect,
        apply_to_all_pages: payload.apply_to_all_pages,
        page_index: payload.page_index,
      };
    case "ocr": {
      const outputMap = {
        searchable_pdf: "SearchablePdf",
        pdf_plus_text: "PdfPlusText",
        text_only: "TextOnly",
      } as const;
      return {
        type: "ocr",
        language: payload.language,
        dpi: payload.dpi,
        // Serde tag rename_all = "snake_case" on the Rust enum gives us:
        // SearchablePdf -> "searchable_pdf"
        output: Object.entries(outputMap).find(
          ([, v]) => v === outputMap[payload.output],
        )?.[0] ?? payload.output,
        deskew: payload.deskew,
        despeckle: payload.despeckle,
      };
    }
    case "watermark":
      return {
        type: "watermark",
        text: payload.text,
        opacity: payload.opacity,
      };
    case "save":
      return {
        type: "save",
        dir: payload.dir,
        name_template: payload.name_template,
      };
  }
}

/** Parse "1,3,5-7" into [1, 3, 5, 6, 7]. Empty/invalid -> []. */
function parsePageInput(s: string): number[] {
  const out: number[] = [];
  for (const part of s.split(",")) {
    const p = part.trim();
    if (!p) continue;
    if (p.includes("-")) {
      const [a, b] = p.split("-").map((x) => Number(x.trim()));
      if (Number.isFinite(a) && Number.isFinite(b) && a <= b) {
        for (let i = a; i <= b; i += 1) out.push(i);
      }
    } else {
      const n = Number(p);
      if (Number.isFinite(n) && n > 0) out.push(n);
    }
  }
  return out;
}
