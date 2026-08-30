import { useEffect, useRef, useState } from "react";
import type * as pdfjs from "pdfjs-dist";
import { save } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";
import { commands } from "@/bindings";
import { Button } from "@/components/ui/button";
import { usePdfDocument } from "@/hooks/usePdfDocument";
import { cn } from "@/lib/utils";
import { PdfViewer } from "../PdfViewer";
import { parsePageRanges } from "./extractSelection";

interface Props {
  docPath: string;
  pageCount: number;
}
const THUMBNAIL_BOX = { width: 112, height: 144 };

interface PageCardProps {
  pdf: pdfjs.PDFDocumentProxy | null;
  index: number;
  pageCount: number;
  selected: boolean;
  onToggle: (index: number) => void;
}

export function ExtractPageCard({ pdf, index, pageCount, selected, onToggle }: PageCardProps) {
  const { t } = useTranslation("workspace");
  const cardRef = useRef<HTMLDivElement>(null);
  const [nearViewport, setNearViewport] = useState(
    () => typeof IntersectionObserver === "undefined"
  );
  const accessibleLabel = t("page_n_of_m", { n: index + 1, m: pageCount });

  useEffect(() => {
    const node = cardRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setNearViewport(true);
          observer.disconnect();
        }
      },
      { rootMargin: "240px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={cardRef}
      role="checkbox"
      aria-checked={selected}
      aria-label={accessibleLabel}
      tabIndex={0}
      onClick={() => onToggle(index)}
      onKeyDown={(event) => {
        if (event.key === " " || event.key === "Enter") {
          event.preventDefault();
          onToggle(index);
        }
      }}
      className={cn(
        "cursor-pointer overflow-hidden rounded border p-2 transition-colors",
        selected
          ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
          : "border-[var(--color-border)] hover:bg-[var(--color-control-hover)]"
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2 border-b border-[var(--color-border)] pb-2">
        <span className="text-xs font-medium tabular-nums" aria-hidden="true">
          {index + 1} / {pageCount}
        </span>
        <input
          type="checkbox"
          checked={selected}
          aria-label={accessibleLabel}
          onClick={(event) => event.stopPropagation()}
          onChange={() => onToggle(index)}
          className="h-4 w-4 accent-[var(--color-accent)]"
        />
      </div>
      <div
        className="flex items-center justify-center overflow-hidden bg-[var(--color-background)]"
        style={{ height: THUMBNAIL_BOX.height }}
      >
        {nearViewport && pdf ? (
          <PdfViewer
            pdf={pdf}
            pageIndex={index}
            zoom={1}
            fitBox={THUMBNAIL_BOX}
            className="shadow"
          />
        ) : (
          <div
            className="h-full w-full animate-pulse bg-[var(--color-control-hover)]"
            aria-hidden="true"
          />
        )}
      </div>
    </div>
  );
}

export function ExtractPanel({ docPath, pageCount }: Props) {
  const { t } = useTranslation(["common", "workspace"]);
  const loaded = usePdfDocument(docPath);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [rangeText, setRangeText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function toggle(index: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }
  function selectAll() {
    setSelected(new Set(Array.from({ length: pageCount }, (_, index) => index)));
  }
  function clear() {
    setSelected(new Set());
  }
  function invert() {
    setSelected(
      (current) =>
        new Set(
          Array.from({ length: pageCount }, (_, index) => index).filter(
            (index) => !current.has(index)
          )
        )
    );
  }

  async function extract() {
    setBusy(true);
    setErr(null);
    try {
      const out = await save({
        defaultPath: docPath.replace(/\.pdf$/i, ".extract.pdf"),
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
      if (!out) return;
      const pages = Array.from(selected)
        .sort((a, b) => a - b)
        .map((page) => page + 1);
      const result = await commands.extractPagesCmd({
        input: docPath,
        output: out,
        pages,
        job_id: crypto.randomUUID(),
      });
      if (result.status === "error") setErr(JSON.stringify(result.error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium">{t("common:tools.extract")}</h3>
      <p className="text-xs text-[var(--color-muted)]">{t("common:extract_panel.description")}</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={selectAll}>
          {t("common:extract_panel.select_all")}
        </Button>
        <Button size="sm" variant="outline" onClick={clear}>
          {t("common:extract_panel.clear")}
        </Button>
        <Button size="sm" variant="outline" onClick={invert}>
          {t("common:extract_panel.invert")}
        </Button>
      </div>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setSelected(parsePageRanges(rangeText, pageCount));
        }}
      >
        <input
          value={rangeText}
          onChange={(event) => setRangeText(event.target.value)}
          aria-label={t("common:extract_panel.range_label")}
          placeholder={t("common:extract_panel.range_placeholder")}
          className="min-w-0 flex-1 rounded border border-[var(--color-border)] bg-[var(--color-background)] px-2 text-xs"
        />
        <Button size="sm" variant="outline" type="submit">
          {t("common:extract_panel.apply_range")}
        </Button>
      </form>
      <div className="grid max-h-[420px] grid-cols-2 gap-2 overflow-auto p-px sm:grid-cols-3">
        {Array.from({ length: pageCount }, (_, index) => (
          <ExtractPageCard
            key={index}
            pdf={loaded?.pdf ?? null}
            index={index}
            pageCount={pageCount}
            selected={selected.has(index)}
            onToggle={toggle}
          />
        ))}
      </div>
      <Button size="sm" disabled={selected.size === 0 || busy} onClick={extract}>
        {busy
          ? t("common:extract_panel.extracting")
          : t("common:extract_panel.extract_count", { count: selected.size })}
      </Button>
      {err && <p className="text-xs text-[var(--color-danger-text)]">{err}</p>}
    </div>
  );
}
