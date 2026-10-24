// FontPicker (Delta U) - system font combobox with grouped sections,
// self-preview, B/I/U/S toggles, size input + slider, and alignment.
//
// The picker loads the system font list once on mount via `list_fonts_cmd`
// and groups results into Standard 14, Recent, and Other System Fonts. The
// trigger button renders the current family name in that family so users
// can verify the choice without opening the popover. Each font row in the
// popover renders its family name in that family too.
//
// This component is the single source of truth for typography across
// FreeText annotation, AcroForm text field default-value rendering, Tier 3
// inline edit, and Watermark. Tools embed it and call back with the full
// `TextStyle` payload (see `services/text_style.rs`).
import { useEffect, useMemo, useState } from "react";
import { Bold, Italic, Underline, Strikethrough, AlignLeft, AlignCenter, AlignRight, AlignJustify } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { commands, type SystemFont, type TextAlign } from "@/bindings";
import { getRecentFonts, pushRecentFont } from "@/lib/recentFonts";
import { cn } from "@/lib/utils";

export interface FontPickerValue {
  font_family: string;
  font_postscript_name: string;
  size_pt: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  align: TextAlign;
}

interface FontPickerProps {
  value: FontPickerValue;
  onChange: (next: FontPickerValue) => void;
  /** When true, hide the alignment toggle group (e.g. for single-line inputs). */
  hideAlign?: boolean;
}

/** True when a face is a better stand-in for its family row than `current`:
 * the regular upright face wins over any other. */
function isBetterFace(candidate: SystemFont, current: SystemFont): boolean {
  const currentIsPlain = !current.italic && current.weight === 400;
  return !currentIsPlain && !candidate.italic && candidate.weight === 400;
}

/** One row per non-standard family, the regular variant when there is one. */
function pickFamilies(all: SystemFont[], match: (f: SystemFont) => boolean) {
  const families = new Map<string, SystemFont>();
  for (const f of all) {
    if (f.is_standard_14 || !match(f)) continue;
    const existing = families.get(f.family);
    if (!existing || isBetterFace(f, existing)) families.set(f.family, f);
  }
  return families;
}

function groupFonts(all: SystemFont[], query: string) {
  const recents = new Set(getRecentFonts());
  const q = query.trim().toLowerCase();
  const match = (f: SystemFont) =>
    !q || f.family.toLowerCase().includes(q) || f.postscript_name.toLowerCase().includes(q);
  const std14 = all.filter((f) => f.is_standard_14 && match(f));
  const recentList = all.filter((f) => !f.is_standard_14 && recents.has(f.family) && match(f));
  // Filter out recent-list entries from the main system list.
  const system = [...pickFamilies(all, match).values()].filter((f) => !recents.has(f.family));
  system.sort((a, b) => a.family.localeCompare(b.family));
  return { std14, recentList, system };
}

export function FontPicker({ value, onChange, hideAlign }: FontPickerProps) {
  const [fonts, setFonts] = useState<SystemFont[] | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await commands.listFontsCmd();
      if (cancelled) return;
      if (res.status === "ok") setFonts(res.data);
      else setFonts([]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const grouped = useMemo(() => groupFonts(fonts ?? [], query), [fonts, query]);

  const choose = (f: SystemFont) => {
    pushRecentFont(f.family);
    // Honor bold/italic state by trying to find a matching face within the family.
    const target = pickFace(fonts ?? [], f.family, value.bold, value.italic) ?? f;
    onChange({
      ...value,
      font_family: f.family,
      font_postscript_name: target.postscript_name,
    });
    setOpen(false);
  };

  const updateStyle = (next: Partial<FontPickerValue>) => {
    const merged = { ...value, ...next };
    // Re-resolve postscript name when bold/italic flips so we follow the
    // user's intent (e.g. picking Bold should switch from Arial to
    // Arial-Bold). For Standard 14, also remap to the matching variant.
    if ("bold" in next || "italic" in next) {
      const refined = pickFace(fonts ?? [], merged.font_family, merged.bold, merged.italic);
      if (refined) merged.font_postscript_name = refined.postscript_name;
    }
    onChange(merged);
  };

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="k-select flex w-full items-center justify-between border-[var(--color-border-strong)]"
          >
            <span style={{ fontFamily: `"${value.font_family}", sans-serif` }}>
              {value.font_family}
            </span>
            <span className="text-xs text-[var(--color-text-muted)]">{value.font_postscript_name}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search fonts…"
            className="w-full border-b border-[var(--color-border)] bg-transparent px-2 py-1 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] outline-none focus-visible:bg-[var(--color-surface-hover)]"
          />
          <div className="max-h-80 overflow-y-auto">
            {fonts === null && (
              <p className="px-2 py-1 text-xs text-[var(--color-text-muted)]">Loading…</p>
            )}
            {grouped.std14.length > 0 && (
              <Group title="Standard 14 (no embedding)">
                {grouped.std14.map((f) => (
                  <FontRow key={f.postscript_name} font={f} active={f.postscript_name === value.font_postscript_name} onClick={() => choose(f)} />
                ))}
              </Group>
            )}
            {grouped.recentList.length > 0 && (
              <Group title="Recent">
                {grouped.recentList.map((f) => (
                  <FontRow key={f.postscript_name} font={f} active={f.postscript_name === value.font_postscript_name} onClick={() => choose(f)} />
                ))}
              </Group>
            )}
            {grouped.system.length > 0 && (
              <Group title="System fonts">
                {grouped.system.map((f) => (
                  <FontRow key={f.postscript_name} font={f} active={f.family === value.font_family} onClick={() => choose(f)} />
                ))}
              </Group>
            )}
          </div>
        </PopoverContent>
      </Popover>

      <ToggleGroup
        type="multiple"
        value={[
          ...(value.bold ? ["bold"] : []),
          ...(value.italic ? ["italic"] : []),
          ...(value.underline ? ["underline"] : []),
          ...(value.strikethrough ? ["strikethrough"] : []),
        ]}
        onValueChange={(arr) =>
          updateStyle({
            bold: arr.includes("bold"),
            italic: arr.includes("italic"),
            underline: arr.includes("underline"),
            strikethrough: arr.includes("strikethrough"),
          })
        }
      >
        <ToggleGroupItem value="bold" aria-label="Bold"><Bold className="h-3 w-3" /></ToggleGroupItem>
        <ToggleGroupItem value="italic" aria-label="Italic"><Italic className="h-3 w-3" /></ToggleGroupItem>
        <ToggleGroupItem value="underline" aria-label="Underline"><Underline className="h-3 w-3" /></ToggleGroupItem>
        <ToggleGroupItem value="strikethrough" aria-label="Strikethrough"><Strikethrough className="h-3 w-3" /></ToggleGroupItem>
      </ToggleGroup>

      <div className="flex items-center gap-2">
        <input
          type="number"
          value={value.size_pt}
          min={6}
          max={200}
          step={1}
          onChange={(e) => updateStyle({ size_pt: clamp(Number(e.target.value), 6, 200) })}
          className="k-input w-16 border-[var(--color-border-strong)] px-1 text-xs"
        />
        <Slider
          value={[value.size_pt]}
          min={6}
          max={200}
          step={1}
          onValueChange={(v) => updateStyle({ size_pt: v[0] })}
          className="flex-1"
        />
      </div>

      {!hideAlign && (
        <ToggleGroup
          type="single"
          value={value.align}
          onValueChange={(v) => v && updateStyle({ align: v as TextAlign })}
        >
          <ToggleGroupItem value="left" aria-label="Align left"><AlignLeft className="h-3 w-3" /></ToggleGroupItem>
          <ToggleGroupItem value="center" aria-label="Align center"><AlignCenter className="h-3 w-3" /></ToggleGroupItem>
          <ToggleGroupItem value="right" aria-label="Align right"><AlignRight className="h-3 w-3" /></ToggleGroupItem>
          <ToggleGroupItem value="justify" aria-label="Justify"><AlignJustify className="h-3 w-3" /></ToggleGroupItem>
        </ToggleGroup>
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-[var(--color-border)] py-1">
      <p className="px-2 pb-0.5 text-xs font-semibold text-[var(--color-text-muted)]">{title}</p>
      {children}
    </div>
  );
}

function FontRow({ font, active, onClick }: { font: SystemFont; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "block w-full truncate px-2 py-1 text-left text-sm hover:bg-[var(--color-surface-hover)]",
        active &&
          "bg-[var(--color-surface-selected)] font-bold text-[var(--color-text)]",
      )}
      style={{ fontFamily: `"${font.family}", sans-serif` }}
      title={font.postscript_name}
    >
      {font.family}
    </button>
  );
}

function pickFace(fonts: SystemFont[], family: string, bold: boolean, italic: boolean): SystemFont | null {
  const candidates = fonts.filter((f) => f.family === family);
  if (candidates.length === 0) return null;
  // Exact match first.
  const exact = candidates.find(
    (f) => f.italic === italic && (bold ? f.weight >= 600 : f.weight < 600),
  );
  if (exact) return exact;
  // Fall back to italic-only or bold-only.
  if (bold) {
    const b = candidates.find((f) => f.weight >= 600);
    if (b) return b;
  }
  if (italic) {
    const i = candidates.find((f) => f.italic);
    if (i) return i;
  }
  return candidates[0];
}

function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}
