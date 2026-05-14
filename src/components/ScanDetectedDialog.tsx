// Phase 13 Task 71 — Auto-prompt scan detection dialog.
//
// When `detect_scanned_pdf` reports a page-text average below the
// threshold, WorkspaceRoute mounts this dialog. The user can pick
// languages, render DPI, and PSM, then trigger an OCR run that
// re-injects an invisible text layer into the open document.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { commands } from "@/bindings";

export type OcrSelections = {
  languages: string[];
  dpi: number;
  psm: number;
};

interface Props {
  open: boolean;
  onClose: () => void;
  onRunOcr: (selections: OcrSelections) => void;
}

export function ScanDetectedDialog({ open, onClose, onRunOcr }: Props) {
  const [available, setAvailable] = useState<string[]>(["eng", "slk", "ces", "deu"]);
  const [selected, setSelected] = useState<string[]>(["eng"]);
  const [dpi, setDpi] = useState(300);
  const [psm, setPsm] = useState(3);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const r = await commands.listOcrLanguages();
      if (cancelled) return;
      if (r.status === "ok") setAvailable(r.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  const toggle = (l: string) => {
    setSelected((prev) =>
      prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l],
    );
  };

  const run = () => {
    if (selected.length === 0) return;
    onRunOcr({ languages: selected, dpi, psm });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="w-[480px] space-y-3 rounded-lg bg-white p-6 shadow-xl dark:bg-neutral-900">
        <h2 className="text-lg font-semibold">This PDF looks like a scan</h2>
        <p className="text-sm text-[var(--color-muted)]">
          No selectable text was found. Run OCR to make it searchable?
        </p>

        <div>
          <p className="mb-1 text-xs font-medium">Languages</p>
          <div className="flex flex-wrap gap-1">
            {available.map((l) => (
              <button
                key={l}
                onClick={() => toggle(l)}
                className={`rounded border px-2 py-1 text-xs ${
                  selected.includes(l)
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
                    : "border-[var(--color-border)]"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between text-xs">
            <span>Render DPI</span>
            <span className="tabular-nums">{dpi}</span>
          </div>
          <Slider value={[dpi]} min={150} max={600} step={25} onValueChange={(v) => setDpi(v[0])} />
        </div>

        <label className="block text-xs">
          <span className="text-[var(--color-muted)]">Page segmentation mode (PSM)</span>
          <select
            value={psm}
            onChange={(e) => setPsm(Number(e.target.value))}
            className="mt-1 block w-full rounded border border-[var(--color-border)] bg-[var(--color-card)] px-2 py-1"
          >
            <option value={3}>3 — Fully automatic (default)</option>
            <option value={6}>6 — Uniform block of text</option>
            <option value={7}>7 — Single text line</option>
            <option value={11}>11 — Sparse text</option>
            <option value={12}>12 — Sparse text with OSD</option>
          </select>
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Later
          </Button>
          <Button onClick={run} disabled={selected.length === 0}>
            Run OCR
          </Button>
        </div>
      </div>
    </div>
  );
}
