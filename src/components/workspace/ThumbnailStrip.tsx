// Virtualized vertical thumbnail strip. Each row mounts a small PdfViewer
// at zoom=0.18 so already-loaded pages cost nothing extra to thumbnail -
// the same PDFDocumentProxy is reused for both the main viewer and the
// strip. react-window 2.x uses `rowComponent` (factory) + `rowProps`
// (extra data) instead of the function-as-child API from 1.x.
import { useMemo } from "react";
import { List, type RowComponentProps } from "react-window";
import type * as pdfjs from "pdfjs-dist";
import { PdfViewer } from "./PdfViewer";
import { cn } from "@/lib/utils";

interface Props {
  pdf: pdfjs.PDFDocumentProxy;
  active: number;
  onSelect: (i: number) => void;
  height: number;
  width?: number;
}

interface RowExtras {
  pdf: pdfjs.PDFDocumentProxy;
  active: number;
  onSelect: (i: number) => void;
}

function Row({ index, style, pdf, active, onSelect }: RowComponentProps<RowExtras>) {
  return (
    <div
      style={style}
      className={cn(
        "flex cursor-pointer items-center justify-center border-b border-[var(--color-border)] p-2",
        index === active && "bg-[var(--color-muted)]",
      )}
      onClick={() => onSelect(index)}
    >
      <PdfViewer pdf={pdf} pageIndex={index} zoom={0.18} className="shadow" />
    </div>
  );
}

export function ThumbnailStrip({ pdf, active, onSelect, height, width = 160 }: Props) {
  // Memoize so react-window doesn't re-render every row on parent re-render.
  const rowProps = useMemo<RowExtras>(
    () => ({ pdf, active, onSelect }),
    [pdf, active, onSelect],
  );
  return (
    <List<RowExtras>
      rowComponent={Row}
      rowProps={rowProps}
      rowCount={pdf.numPages}
      rowHeight={140}
      style={{ height, width }}
      overscanCount={2}
    />
  );
}
