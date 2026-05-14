// Phase 12 Task 67 — Edit Tier 2 (annotations) panel — Delta U.
//
// Mode-aware options panel: each annotation kind exposes a tailored set of
// controls (color, width, opacity, font, alignment, ...). The user
// configures the active mode, then clicks "Add at center of page" — this
// avoids the more involved Konva drag-create flow while still producing
// real `/Annot` dictionaries through `apply_annotations_cmd`. The drag-
// create flow is wired in Phase 17 polish.
//
// Note (Stamp): the backend now embeds the supplied image as a real `/AP /N`
// appearance stream when the path resolves; if reading the file fails we
// fall back to the legacy "Approved" placeholder stamp.
import { useMemo, useState } from "react";
import { open as openDialog, save } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ColorPicker } from "@/components/ui/color-picker";
import {
  commands,
  type Annotation,
  type BorderStyle,
  type LineEnd,
  type NoteIcon,
  type TextStyle,
} from "@/bindings";
import { useAutosave } from "@/hooks/useAutosave";
import { useAnnotations, type AnnotationMode } from "@/stores/annotationsStore";
import { useWorkspace } from "@/stores/workspaceStore";
import { cn } from "@/lib/utils";
import { FontPicker } from "@/components/ui/font-picker";

interface Props {
  docPath: string;
  pageWidth: number;
  pageHeight: number;
}

const MODES: { id: AnnotationMode; label: string }[] = [
  { id: "highlight", label: "Highlight" },
  { id: "note", label: "Note" },
  { id: "square", label: "Square" },
  { id: "circle", label: "Circle" },
  { id: "line", label: "Line / Arrow" },
  { id: "freetext", label: "Free text" },
  { id: "stamp", label: "Stamp" },
  { id: "ink", label: "Ink" },
];

interface ModeConfig {
  // Shared
  color: string;
  fillColor: string;
  strokeWidth: number;
  opacity: number;
  // Note
  noteIcon: NoteIcon;
  // Border style for square / circle / line
  borderStyle: BorderStyle;
  // Line
  lineStartEnd: LineEnd;
  lineEndEnd: LineEnd;
  // FreeText (Delta U full TextStyle)
  textStyle: TextStyle;
  freetextContents: string;
  // Stamp
  stampImagePath: string | null;
  stampRotation: number;
  stampScale: number;
}

function defaultTextStyle(): TextStyle {
  return {
    font_family: "Helvetica",
    font_postscript_name: "Helvetica",
    size_pt: 12,
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
    color: [0, 0, 0],
    background: null,
    align: "left",
    letter_spacing: 0,
    line_height_multiplier: 1.2,
  };
}

function defaultConfig(): ModeConfig {
  return {
    color: "#fff200",
    fillColor: "transparent",
    strokeWidth: 2,
    opacity: 0.5,
    noteIcon: "comment",
    borderStyle: "solid",
    lineStartEnd: "none",
    lineEndEnd: "open_arrow",
    textStyle: defaultTextStyle(),
    freetextContents: "Sample text",
    stampImagePath: null,
    stampRotation: 0,
    stampScale: 1,
  };
}

export function EditAnnotationsPanel({ docPath, pageWidth, pageHeight }: Props) {
  const { t } = useTranslation("common");
  const mode = useAnnotations((s) => s.mode);
  const setMode = useAnnotations((s) => s.setMode);
  const annotations = useAnnotations((s) => s.byDoc[docPath] ?? []);
  const addAnnotation = useAnnotations((s) => s.add);
  const removeAnnotation = useAnnotations((s) => s.remove);
  const clearAll = useAnnotations((s) => s.clear);
  const activePage = useWorkspace((s) => s.activePage);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [cfg, setCfg] = useState<ModeConfig>(defaultConfig);
  const [lastMode, setLastMode] = useState<AnnotationMode>(mode);

  // Reset config on mode switch to a sensible default for that mode —
  // derived inline (not in an effect) to keep eslint
  // react-hooks/set-state-in-effect happy and avoid cascading renders.
  if (mode !== lastMode) {
    setLastMode(mode);
    setCfg((prev) => ({
      ...prev,
      color:
        mode === "highlight"
          ? "#fff200"
          : mode === "note"
            ? "#ffcc33"
            : prev.color,
      strokeWidth: mode === "ink" ? 3 : mode === "highlight" ? 1 : prev.strokeWidth,
      opacity: mode === "highlight" ? 0.5 : 1,
    }));
  }

  // Autosave the in-progress annotation set.
  useAutosave(docPath, { tool: "annotations", annotations }, 5000);

  // Compute a default rectangle in PDF points centered on the current page
  // (we use the rendered page size as a proxy; the bbox lives in document
  // coordinates so the user can re-position from a viewer afterwards).
  const defaultRect = useMemo<[number, number, number, number]>(() => {
    const w = Math.max(pageWidth, 200);
    const h = Math.max(pageHeight, 200);
    const cx = w / 2;
    const cy = h / 2;
    const dx = 120;
    const dy = 40;
    return [cx - dx / 2, cy - dy / 2, cx + dx / 2, cy + dy / 2];
  }, [pageWidth, pageHeight]);

  function buildAnnotation(): Annotation | null {
    const c3 = hexToRgb(cfg.color);
    const fc4 = cfg.fillColor === "transparent" ? null : hexToRgba(cfg.fillColor);
    switch (mode) {
      case "highlight": {
        const r = defaultRect;
        const quad: [number, number, number, number, number, number, number, number] = [
          r[0], r[3], r[2], r[3], r[0], r[1], r[2], r[1],
        ];
        return {
          type: "highlight",
          page: activePage,
          quads: [quad],
          color: c3,
          opacity: cfg.opacity,
        };
      }
      case "note":
        return {
          type: "note",
          page: activePage,
          x: defaultRect[0],
          y: defaultRect[1],
          contents: cfg.freetextContents || "Note",
          icon: cfg.noteIcon,
          color: c3,
        };
      case "square":
        return {
          type: "square",
          page: activePage,
          rect: defaultRect,
          border_color: c3,
          border_width: cfg.strokeWidth,
          border_style: cfg.borderStyle,
          fill_color: fc4,
          corner_radius: 0,
        };
      case "circle":
        return {
          type: "circle",
          page: activePage,
          rect: defaultRect,
          border_color: c3,
          border_width: cfg.strokeWidth,
          border_style: cfg.borderStyle,
          fill_color: fc4,
        };
      case "line":
        return {
          type: "line",
          page: activePage,
          from: [defaultRect[0], defaultRect[1]],
          to: [defaultRect[2], defaultRect[3]],
          color: c3,
          width: cfg.strokeWidth,
          style: cfg.borderStyle,
          arrow_start: cfg.lineStartEnd,
          arrow_end: cfg.lineEndEnd,
        };
      case "freetext":
        return {
          type: "free_text",
          page: activePage,
          rect: defaultRect,
          contents: cfg.freetextContents,
          style: { ...cfg.textStyle, color: c3 },
          background_fill: fc4,
          border_color: c3,
          border_width: cfg.strokeWidth,
          auto_resize: true,
        };
      case "stamp":
        if (!cfg.stampImagePath) {
          setErr("Pick an image first");
          return null;
        }
        return {
          type: "stamp",
          page: activePage,
          rect: defaultRect,
          image_path: cfg.stampImagePath,
          scale: cfg.stampScale,
          rotation: cfg.stampRotation,
          opacity: cfg.opacity,
        };
      case "ink": {
        const r = defaultRect;
        // Default ink stroke: a straight diagonal across the bbox so users
        // see a visible mark; replace via Konva drag-create later.
        return {
          type: "ink",
          page: activePage,
          lines: [
            [
              [r[0], r[1]],
              [r[2], r[3]],
            ],
          ],
          color: c3,
          width: cfg.strokeWidth,
          opacity: cfg.opacity,
          smoothing: true,
        };
      }
    }
  }

  function onAdd() {
    setErr(null);
    const a = buildAnnotation();
    if (a) addAnnotation(docPath, a);
  }

  async function onPickStampImage() {
    const picked = await openDialog({
      multiple: false,
      directory: false,
      filters: [{ name: "Image", extensions: ["png", "jpg", "jpeg", "bmp", "tiff"] }],
    });
    if (typeof picked === "string") {
      setCfg((c) => ({ ...c, stampImagePath: picked }));
    }
  }

  async function onSave() {
    if (annotations.length === 0) return;
    setBusy(true);
    setErr(null);
    try {
      const out = await save({
        defaultPath: docPath.replace(/\.pdf$/i, ".annotated.pdf"),
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
      if (!out) return;
      const r = await commands.applyAnnotationsCmd({
        input: docPath,
        output: out,
        annotations: annotations.map(stripClientId) as Annotation[],
        job_id: crypto.randomUUID(),
      });
      if (r.status === "error") setErr(JSON.stringify(r.error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium">{t("tools.edit")} — Annotations</h3>
      <p className="text-xs text-[var(--color-muted)]">
        Pick a tool, tune its options, then add it to the current page.
      </p>
      <div className="flex flex-wrap gap-1">
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className={cn(
              "rounded border px-2 py-1 text-xs",
              mode === m.id
                ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
                : "border-[var(--color-border)] hover:bg-neutral-100 dark:hover:bg-neutral-800",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      <ModeOptions
        mode={mode}
        cfg={cfg}
        setCfg={setCfg}
        onPickStampImage={onPickStampImage}
      />

      <Button size="sm" onClick={onAdd} className="w-full">
        Add to page {activePage + 1}
      </Button>

      <div className="max-h-[200px] space-y-1 overflow-auto text-xs">
        {annotations.length === 0 ? (
          <p className="text-[var(--color-muted)]">No annotations yet.</p>
        ) : (
          annotations.map((a) => (
            <div
              key={a.__clientId}
              className="flex items-center justify-between rounded border px-2 py-1"
            >
              <span className="truncate">
                {a.type} (p{a.page + 1})
              </span>
              <button
                onClick={() => removeAnnotation(docPath, a.__clientId)}
                className="text-red-600 hover:underline"
                aria-label="Remove"
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => clearAll(docPath)}>
          Clear
        </Button>
        <Button
          size="sm"
          disabled={busy || annotations.length === 0}
          onClick={onSave}
        >
          {busy ? "Saving…" : `Apply ${annotations.length}`}
        </Button>
      </div>
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  );
}

function ModeOptions({
  mode,
  cfg,
  setCfg,
  onPickStampImage,
}: {
  mode: AnnotationMode;
  cfg: ModeConfig;
  setCfg: React.Dispatch<React.SetStateAction<ModeConfig>>;
  onPickStampImage: () => void;
}) {
  const toolKey = `annotation.${mode}`;
  return (
    <div className="space-y-2 rounded border border-[var(--color-border)] p-2">
      {mode === "highlight" && (
        <>
          <ColorPicker
            label="Color"
            toolKey={toolKey}
            value={cfg.color}
            onChange={(c) => setCfg((s) => ({ ...s, color: c }))}
          />
          <SliderRow
            label="Opacity"
            value={cfg.opacity}
            min={0.1}
            max={1}
            step={0.05}
            display={`${Math.round(cfg.opacity * 100)}%`}
            onChange={(v) => setCfg((s) => ({ ...s, opacity: v }))}
          />
        </>
      )}
      {mode === "note" && (
        <>
          <ColorPicker
            label="Color"
            toolKey={toolKey}
            value={cfg.color}
            onChange={(c) => setCfg((s) => ({ ...s, color: c }))}
          />
          <SelectRow
            label="Icon"
            value={cfg.noteIcon}
            options={["comment", "check", "cross", "key", "note", "insert"]}
            onChange={(v) =>
              setCfg((s) => ({ ...s, noteIcon: v as NoteIcon }))
            }
          />
          <TextRow
            label="Contents"
            value={cfg.freetextContents}
            onChange={(v) =>
              setCfg((s) => ({ ...s, freetextContents: v }))
            }
          />
        </>
      )}
      {(mode === "square" || mode === "circle") && (
        <>
          <ColorPicker
            label="Border"
            toolKey={toolKey}
            value={cfg.color}
            onChange={(c) => setCfg((s) => ({ ...s, color: c }))}
          />
          <ColorPicker
            label="Fill"
            toolKey={`${toolKey}.fill`}
            allowTransparent
            value={cfg.fillColor}
            onChange={(c) => setCfg((s) => ({ ...s, fillColor: c }))}
          />
          <SliderRow
            label="Border width"
            value={cfg.strokeWidth}
            min={0}
            max={10}
            step={0.5}
            display={`${cfg.strokeWidth} pt`}
            onChange={(v) => setCfg((s) => ({ ...s, strokeWidth: v }))}
          />
          <SelectRow
            label="Border style"
            value={cfg.borderStyle}
            options={["solid", "dashed", "dotted"]}
            onChange={(v) =>
              setCfg((s) => ({ ...s, borderStyle: v as BorderStyle }))
            }
          />
        </>
      )}
      {mode === "line" && (
        <>
          <ColorPicker
            label="Color"
            toolKey={toolKey}
            value={cfg.color}
            onChange={(c) => setCfg((s) => ({ ...s, color: c }))}
          />
          <SliderRow
            label="Width"
            value={cfg.strokeWidth}
            min={0}
            max={10}
            step={0.5}
            display={`${cfg.strokeWidth} pt`}
            onChange={(v) => setCfg((s) => ({ ...s, strokeWidth: v }))}
          />
          <SelectRow
            label="Style"
            value={cfg.borderStyle}
            options={["solid", "dashed", "dotted"]}
            onChange={(v) =>
              setCfg((s) => ({ ...s, borderStyle: v as BorderStyle }))
            }
          />
          <SelectRow
            label="Start"
            value={cfg.lineStartEnd}
            options={["none", "open_arrow", "closed_arrow", "diamond", "square", "circle"]}
            onChange={(v) =>
              setCfg((s) => ({ ...s, lineStartEnd: v as LineEnd }))
            }
          />
          <SelectRow
            label="End"
            value={cfg.lineEndEnd}
            options={["none", "open_arrow", "closed_arrow", "diamond", "square", "circle"]}
            onChange={(v) =>
              setCfg((s) => ({ ...s, lineEndEnd: v as LineEnd }))
            }
          />
        </>
      )}
      {mode === "freetext" && (
        <>
          <TextRow
            label="Contents"
            value={cfg.freetextContents}
            onChange={(v) =>
              setCfg((s) => ({ ...s, freetextContents: v }))
            }
          />
          <ColorPicker
            label="Text"
            toolKey={toolKey}
            value={cfg.color}
            onChange={(c) => setCfg((s) => ({ ...s, color: c }))}
          />
          <ColorPicker
            label="Background"
            toolKey={`${toolKey}.bg`}
            allowTransparent
            value={cfg.fillColor}
            onChange={(c) => setCfg((s) => ({ ...s, fillColor: c }))}
          />
          <FontPicker
            value={{
              font_family: cfg.textStyle.font_family,
              font_postscript_name: cfg.textStyle.font_postscript_name,
              size_pt: cfg.textStyle.size_pt ?? 12,
              bold: cfg.textStyle.bold,
              italic: cfg.textStyle.italic,
              underline: cfg.textStyle.underline,
              strikethrough: cfg.textStyle.strikethrough,
              align: cfg.textStyle.align,
            }}
            onChange={(v) =>
              setCfg((s) => ({
                ...s,
                textStyle: { ...s.textStyle, ...v },
              }))
            }
          />
        </>
      )}
      {mode === "stamp" && (
        <>
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="truncate text-[var(--color-muted)]">
              {cfg.stampImagePath ?? "No image picked"}
            </span>
            <Button size="sm" variant="outline" onClick={onPickStampImage}>
              Pick…
            </Button>
          </div>
          <SliderRow
            label="Scale"
            value={cfg.stampScale}
            min={0.1}
            max={3}
            step={0.1}
            display={`${Math.round(cfg.stampScale * 100)}%`}
            onChange={(v) => setCfg((s) => ({ ...s, stampScale: v }))}
          />
          <SliderRow
            label="Rotation"
            value={cfg.stampRotation}
            min={-180}
            max={180}
            step={5}
            display={`${cfg.stampRotation}°`}
            onChange={(v) => setCfg((s) => ({ ...s, stampRotation: v }))}
          />
          <SliderRow
            label="Opacity"
            value={cfg.opacity}
            min={0.1}
            max={1}
            step={0.05}
            display={`${Math.round(cfg.opacity * 100)}%`}
            onChange={(v) => setCfg((s) => ({ ...s, opacity: v }))}
          />
        </>
      )}
      {mode === "ink" && (
        <>
          <ColorPicker
            label="Color"
            toolKey={toolKey}
            value={cfg.color}
            onChange={(c) => setCfg((s) => ({ ...s, color: c }))}
          />
          <SliderRow
            label="Brush"
            value={cfg.strokeWidth}
            min={1}
            max={20}
            step={1}
            display={`${cfg.strokeWidth} pt`}
            onChange={(v) => setCfg((s) => ({ ...s, strokeWidth: v }))}
          />
          <SliderRow
            label="Opacity"
            value={cfg.opacity}
            min={0.1}
            max={1}
            step={0.05}
            display={`${Math.round(cfg.opacity * 100)}%`}
            onChange={(v) => setCfg((s) => ({ ...s, opacity: v }))}
          />
        </>
      )}
    </div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-20 shrink-0 text-[var(--color-muted)]">{label}</span>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0])}
        className="flex-1"
      />
      <span className="w-12 shrink-0 text-right tabular-nums">{display}</span>
    </div>
  );
}

function SelectRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="w-20 shrink-0 text-[var(--color-muted)]">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 rounded border border-[var(--color-border)] bg-[var(--color-card)] px-1 py-0.5"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o.replace(/_/g, " ")}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="w-20 shrink-0 text-[var(--color-muted)]">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 rounded border border-[var(--color-border)] bg-[var(--color-card)] px-1 py-0.5"
      />
    </label>
  );
}

function stripClientId<T extends { __clientId: string }>(a: T): Omit<T, "__clientId"> {
  const { __clientId: _unused, ...rest } = a;
  void _unused;
  return rest;
}

// "#rrggbb[aa]" → [r, g, b] in 0..1.
function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex.replace(/^#/, ""));
  if (!m) return [0, 0, 0];
  return [
    parseInt(m[1], 16) / 255,
    parseInt(m[2], 16) / 255,
    parseInt(m[3], 16) / 255,
  ];
}

// "#rrggbbaa" → [r, g, b, a]; missing alpha defaults to 1.
function hexToRgba(hex: string): [number, number, number, number] {
  const clean = hex.replace(/^#/, "");
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const a = clean.length >= 8 ? parseInt(clean.slice(6, 8), 16) / 255 : 1;
  return [r, g, b, a];
}
