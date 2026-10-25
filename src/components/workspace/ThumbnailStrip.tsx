// Left page panel: a virtualized thumbnail list. Each page is contain-
// fitted into a fixed box (T1.5 / D), numbered underneath, with the
// current page highlighted. react-window only mounts rows near the
// viewport, so long documents stay cheap. Collapse is session state
// owned by the workspace store.
import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { List, type ListImperativeAPI, type RowComponentProps } from "react-window";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type * as pdfjs from "pdfjs-dist";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PdfViewer } from "./PdfViewer";
import { thumbnailSelection } from "./thumbnailSelection";
import {
  THUMBNAIL_BOX_HEIGHT,
  THUMBNAIL_BOX_WIDTH,
  THUMBNAIL_COLLAPSED_WIDTH,
  THUMBNAIL_HEADER_HEIGHT,
  THUMBNAIL_ROW_HEIGHT,
  THUMBNAIL_STRIP_WIDTH,
} from "./thumbnailLayout";

const THUMB_FIT_BOX = { width: THUMBNAIL_BOX_WIDTH, height: THUMBNAIL_BOX_HEIGHT };

interface Props {
  pdf: pdfjs.PDFDocumentProxy;
  active: number;
  bookMode: boolean;
  onSelect: (i: number) => void;
  height: number;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

interface RowExtras {
  pdf: pdfjs.PDFDocumentProxy;
  active: number;
  bookMode: boolean;
  onSelect: (i: number) => void;
  pageCount: number;
}

function Row({
  index,
  style,
  pdf,
  active,
  bookMode,
  onSelect,
  pageCount,
}: RowComponentProps<RowExtras>) {
  const { t } = useTranslation("workspace");
  const label = t("page_n_of_m", { n: index + 1, m: pageCount });
  const selection = thumbnailSelection(index, active, pageCount, bookMode);
  return (
    <div style={style} className="px-2">
      <button
        type="button"
        aria-label={label}
        aria-current={selection.focused ? "page" : undefined}
        title={label}
        onClick={() => onSelect(index)}
        className={cn(
          "flex h-full w-full cursor-pointer flex-col items-center rounded-[var(--radius-sm)] border border-transparent hover:bg-[var(--color-surface-hover)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-focus)]",
          selection.highlighted && "bg-[var(--color-accent-soft)]",
          selection.focused && "font-bold",
        )}
      >
        <div
          className="flex items-center justify-center overflow-hidden bg-[var(--color-well)]"
          style={{ width: THUMBNAIL_BOX_WIDTH, height: THUMBNAIL_BOX_HEIGHT }}
        >
          <PdfViewer
            pdf={pdf}
            pageIndex={index}
            zoom={1}
            fitBox={THUMB_FIT_BOX}
            className="border border-[var(--color-border)] bg-[var(--color-surface-raised)]"
          />
        </div>
        <span className="mt-1 text-xs tabular-nums text-[var(--color-text-muted)]">{index + 1}</span>
      </button>
    </div>
  );
}

export function ThumbnailStrip({
  pdf,
  active,
  bookMode,
  onSelect,
  height,
  collapsed,
  onToggleCollapsed,
}: Props) {
  const { t } = useTranslation("workspace");
  const listRef = useRef<ListImperativeAPI | null>(null);
  const pageCount = pdf.numPages;
  const rowProps = useMemo<RowExtras>(
    () => ({ pdf, active, bookMode, onSelect, pageCount }),
    [pdf, active, bookMode, onSelect, pageCount],
  );

  useEffect(() => {
    if (collapsed || pageCount === 0) return;
    if (active < 0 || active >= pageCount) return;
    listRef.current?.scrollToRow({ index: active, align: "smart" });
  }, [active, collapsed, listRef, pageCount]);

  const width = collapsed ? THUMBNAIL_COLLAPSED_WIDTH : THUMBNAIL_STRIP_WIDTH;
  const listHeight = Math.max(0, height - THUMBNAIL_HEADER_HEIGHT);

  return (
    <nav
      aria-label={t("thumbnails")}
      className="flex h-full flex-col bg-[var(--color-background)]"
      style={{ width, height }}
    >
      <div
        className="flex shrink-0 items-center border-b border-[var(--color-border)] px-1"
        style={{ height: THUMBNAIL_HEADER_HEIGHT }}
      >
        {!collapsed && (
          <span className="min-w-0 flex-1 truncate px-1 text-xs text-[var(--color-text-muted)]">
            {t("page_panel.pages", { count: pageCount })}
          </span>
        )}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 w-7 shrink-0 p-0"
          aria-label={collapsed ? t("page_panel.expand") : t("page_panel.collapse")}
          aria-expanded={!collapsed}
          onClick={onToggleCollapsed}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>
      {!collapsed && (
        <List<RowExtras>
          listRef={listRef}
          rowComponent={Row}
          rowProps={rowProps}
          rowCount={pageCount}
          rowHeight={THUMBNAIL_ROW_HEIGHT}
          style={{ height: listHeight, width }}
          overscanCount={3}
        />
      )}
    </nav>
  );
}
