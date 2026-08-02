// Phase 13 Task 71 - Auto-prompt scan detection dialog.
//
// When `detect_scanned_pdf` reports a page-text average below the
// threshold, WorkspaceRoute mounts this dialog. The user can pick
// languages, render DPI, and PSM, then trigger an OCR run that
// re-injects an invisible text layer into the open document.
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { commands } from "@/bindings";
import { type OcrEngineId, useOcrBackends } from "@/hooks/useOcrBackends";

export type OcrSelections = {
  engine: OcrEngineId;
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
  const { t } = useTranslation("common");
  const [tesseractLanguages, setTesseractLanguages] = useState<string[]>([
    "eng",
    "slk",
    "ces",
    "deu",
    "pol",
  ]);
  const [selected, setSelected] = useState<string[]>(["eng"]);
  const [engine, setEngine] = useState<OcrEngineId>("tesseract");
  const [dpi, setDpi] = useState(300);
  const [psm, setPsm] = useState(3);
  const backends = useOcrBackends(open);
  const selectedBackend = backends.find((backend) => backend.id === engine);
  const available =
    engine === "rapidocr" && selectedBackend
      ? selectedBackend.supported_languages
      : tesseractLanguages;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const r = await commands.listOcrLanguages();
      if (cancelled) return;
      if (r.status === "ok" && engine === "tesseract") setTesseractLanguages(r.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [engine, open]);

  const selectEngine = (nextEngine: OcrEngineId) => {
    setEngine(nextEngine);
    if (nextEngine === "rapidocr") {
      const supportedLanguages =
        backends.find((backend) => backend.id === nextEngine)?.supported_languages ?? [];
      setSelected((current) => {
        const supported = current.filter((language) => supportedLanguages.includes(language));
        return supported.length > 0 ? supported : ["eng"];
      });
    }
  };

  if (!open) return null;

  const toggle = (l: string) => {
    setSelected((prev) => (prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l]));
  };

  const run = () => {
    if (selected.length === 0) return;
    onRunOcr({ engine, languages: selected, dpi, psm });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-overlay-soft)]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ocr-scan-title"
        aria-describedby="ocr-scan-description"
        className="max-h-[calc(100vh-2rem)] w-[480px] space-y-3 overflow-y-auto rounded-lg bg-[var(--color-card)] p-6 text-[var(--color-foreground)] shadow-xl"
      >
        <h2 id="ocr-scan-title" className="text-lg font-semibold text-balance">
          {t("ocr_scan.title")}
        </h2>
        <p id="ocr-scan-description" className="text-sm text-pretty text-[var(--color-muted)]">
          {t("ocr_scan.description")}
        </p>

        <label className="block text-xs">
          <span className="font-medium">{t("ocr_scan.engine")}</span>
          <select
            value={engine}
            onChange={(event) => selectEngine(event.target.value as OcrEngineId)}
            className="mt-1 block min-h-10 w-full rounded border border-[var(--color-border)] bg-[var(--color-card)] px-2 py-1"
          >
            <option value="tesseract">{t("ocr_scan.engine_tesseract")}</option>
            <option value="rapidocr">{t("ocr_scan.engine_rapidocr")}</option>
          </select>
        </label>
        {selectedBackend && !selectedBackend.available && (
          <div
            role="status"
            className="rounded border border-[var(--color-warning)] bg-[var(--color-warning-soft)] px-3 py-2 text-xs text-[var(--color-warning-soft-foreground)]"
          >
            <p>
              {t("ocr_scan.engine_unavailable", {
                engine: selectedBackend.display_name,
              })}
            </p>
            {selectedBackend.unavailable_reason && (
              <p className="mt-1 text-[11px] break-words opacity-80">
                {t("ocr_scan.engine_unavailable_reason", {
                  reason: selectedBackend.unavailable_reason,
                })}
              </p>
            )}
          </div>
        )}

        <div>
          <p className="mb-1 text-xs font-medium">{t("ocr_scan.languages")}</p>
          <div className="flex flex-wrap gap-1">
            {available.map((l) => (
              <button
                type="button"
                key={l}
                aria-pressed={selected.includes(l)}
                onClick={() => toggle(l)}
                className={`min-h-10 rounded border px-3 py-1 text-xs transition-transform duration-150 ease-out active:scale-[0.96] ${
                  selected.includes(l)
                    ? "border-[var(--color-focus)] bg-[var(--color-accent-soft)] text-[var(--color-accent-soft-foreground)]"
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
            <span>{t("ocr_scan.render_dpi")}</span>
            <span className="tabular-nums">{dpi}</span>
          </div>
          <Slider value={[dpi]} min={150} max={600} step={25} onValueChange={(v) => setDpi(v[0])} />
        </div>

        <label className="block text-xs">
          <span className="text-[var(--color-muted)]">{t("ocr_scan.psm")}</span>
          <select
            value={psm}
            onChange={(e) => setPsm(Number(e.target.value))}
            disabled={engine === "rapidocr"}
            className="mt-1 block min-h-10 w-full rounded border border-[var(--color-border)] bg-[var(--color-card)] px-2 py-1"
          >
            <option value={3}>{t("ocr_scan.psm_auto")}</option>
            <option value={6}>{t("ocr_scan.psm_block")}</option>
            <option value={7}>{t("ocr_scan.psm_line")}</option>
            <option value={11}>{t("ocr_scan.psm_sparse")}</option>
            <option value={12}>{t("ocr_scan.psm_sparse_osd")}</option>
          </select>
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            {t("ocr_scan.later")}
          </Button>
          <Button onClick={run} disabled={selected.length === 0}>
            {t("ocr_scan.run")}
          </Button>
        </div>
      </div>
    </div>
  );
}
