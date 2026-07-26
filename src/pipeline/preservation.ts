// Delta Y: frontend preservation contracts.
//
// Mirrors the matrix in `src-tauri/src/pipeline/preservation.rs` so the
// pipeline editor can compute edge warnings live as the user wires up
// nodes (before they click "Run"). The Rust executor runs the
// authoritative preflight at run time; this is just an instant UI
// signal.

import type { NodeKindKey, NodeKindPayload } from "./nodeKinds";

export type Artifact =
  | "text_layer"
  | "annotations"
  | "form_fields"
  | "bookmarks"
  | "embedded_fonts"
  | "pdfa_compliance"
  | "linearization";

const ALL_ARTIFACTS: Artifact[] = [
  "text_layer",
  "annotations",
  "form_fields",
  "bookmarks",
  "embedded_fonts",
  "pdfa_compliance",
  "linearization",
];

export interface PreservationContract {
  preserves: Set<Artifact>;
  may_strip: Set<Artifact>;
}

function s(...items: Artifact[]): Set<Artifact> {
  return new Set(items);
}

export function preservationFor(payload: NodeKindPayload): PreservationContract {
  switch (payload.kind) {
    case "open_file":
      return {
        preserves: new Set(ALL_ARTIFACTS),
        may_strip: new Set(),
      };
    case "compress":
      return {
        preserves: s(
          "text_layer",
          "annotations",
          "form_fields",
          "bookmarks",
          "embedded_fonts",
        ),
        may_strip: s("pdfa_compliance", "linearization", "embedded_fonts"),
      };
    case "optimize": {
      const opts = payload.options;
      const preserves = s("text_layer", "embedded_fonts");
      const may_strip = new Set<Artifact>();
      if (opts.flatten_annotations) may_strip.add("annotations");
      else preserves.add("annotations");
      if (opts.remove_form_data) may_strip.add("form_fields");
      else preserves.add("form_fields");
      if (opts.strip_metadata) may_strip.add("bookmarks");
      else preserves.add("bookmarks");
      if (opts.linearize) preserves.add("linearization");
      else may_strip.add("linearization");
      if (opts.pdfa) preserves.add("pdfa_compliance");
      else may_strip.add("pdfa_compliance");
      return { preserves, may_strip };
    }
    case "unlock":
      return {
        preserves: s(
          "text_layer",
          "annotations",
          "form_fields",
          "bookmarks",
          "embedded_fonts",
          "pdfa_compliance",
        ),
        may_strip: s("linearization"),
      };
    case "convert":
      if (payload.options.format === "pdfa") {
        return {
          preserves: s(
            "text_layer",
            "annotations",
            "form_fields",
            "bookmarks",
            "embedded_fonts",
            "pdfa_compliance",
          ),
          may_strip: s("linearization"),
        };
      }
      return {
        preserves: new Set(),
        may_strip: new Set(ALL_ARTIFACTS),
      };
    case "convert_import":
      return { preserves: new Set(), may_strip: new Set() };
    case "merge":
      return {
        preserves: s("text_layer", "annotations", "form_fields", "embedded_fonts"),
        may_strip: s("bookmarks", "linearization", "pdfa_compliance"),
      };
    case "split":
      return {
        preserves: s(
          "text_layer",
          "annotations",
          "form_fields",
          "embedded_fonts",
          "bookmarks",
        ),
        may_strip: s("linearization", "pdfa_compliance"),
      };
    case "extract":
      return {
        preserves: s(
          "text_layer",
          "annotations",
          "form_fields",
          "embedded_fonts",
        ),
        may_strip: s("bookmarks", "linearization", "pdfa_compliance"),
      };
    case "organize_rotate":
    case "organize_delete":
    case "organize_reorder":
    case "organize_insert_blank":
      return {
        preserves: s(
          "text_layer",
          "annotations",
          "form_fields",
          "bookmarks",
          "embedded_fonts",
        ),
        may_strip: s("linearization", "pdfa_compliance"),
      };
    case "crop":
      return {
        preserves: s(
          "text_layer",
          "annotations",
          "form_fields",
          "bookmarks",
          "embedded_fonts",
        ),
        may_strip: s("linearization", "pdfa_compliance"),
      };
    case "ocr":
      return {
        preserves: s(
          "text_layer",
          "annotations",
          "form_fields",
          "bookmarks",
          "embedded_fonts",
        ),
        may_strip: s("pdfa_compliance", "linearization"),
      };
    case "watermark":
      return {
        preserves: s("text_layer", "annotations", "form_fields", "bookmarks"),
        may_strip: s("embedded_fonts", "pdfa_compliance", "linearization"),
      };
    case "save":
      return {
        preserves: new Set(ALL_ARTIFACTS),
        may_strip: new Set(),
      };
  }
}

export interface EdgeWarning {
  from: string;
  to: string;
  artifacts: Artifact[];
}

/** Compute edge-level Delta Y warnings for a draft pipeline. */
export function computeEdgeWarnings(
  nodes: Array<{ id: string; config: NodeKindPayload }>,
  edges: Array<{ source: string; target: string }>,
): EdgeWarning[] {
  const byId = new Map(nodes.map((n) => [n.id, n.config]));
  const out: EdgeWarning[] = [];
  for (const e of edges) {
    const from = byId.get(e.source);
    const to = byId.get(e.target);
    if (!from || !to) continue;
    const fromC = preservationFor(from);
    const toC = preservationFor(to);
    const conflict: Artifact[] = [];
    for (const a of fromC.preserves) {
      if (toC.may_strip.has(a)) conflict.push(a);
    }
    if (conflict.length > 0) {
      out.push({ from: e.source, to: e.target, artifacts: conflict });
    }
  }
  return out;
}

const ARTIFACT_LABELS: Record<Artifact, string> = {
  text_layer: "text layer",
  annotations: "annotations",
  form_fields: "form fields",
  bookmarks: "bookmarks",
  embedded_fonts: "embedded fonts",
  pdfa_compliance: "PDF/A compliance",
  linearization: "linearization",
};

export function artifactLabel(a: Artifact): string {
  return ARTIFACT_LABELS[a];
}

// Convenience: used in PipelinePresetBar to remind the user a Save node
// is missing if they ever export a preset that ends without one.
export function lastNodeKind(
  nodes: Array<{ id: string; config: NodeKindPayload }>,
  edges: Array<{ source: string; target: string }>,
): NodeKindKey | null {
  const targets = new Set(edges.map((e) => e.target));
  // The terminal nodes are those that are NOT a source.
  const sources = new Set(edges.map((e) => e.source));
  const terminals = nodes.filter((n) => !sources.has(n.id));
  if (terminals.length === 0) return null;
  // Prefer one that has incoming edges (real endpoint).
  const real = terminals.find((n) => targets.has(n.id));
  return (real ?? terminals[0]).config.kind;
}
