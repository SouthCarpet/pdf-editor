import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Minus, Plus } from "lucide-react";
import { usePdfDocument } from "@/hooks/usePdfDocument";
import { Button } from "@/components/ui/button";
import type { VisualDiffPage } from "@/bindings";
import { clampZoom, ZOOM_DEFAULT, ZOOM_STEP } from "@/stores/workspaceStore";
import { PdfViewer } from "./PdfViewer";
import { mapSyncedScrollPosition } from "./compareScroll";

interface Props {
  leftPath: string;
  rightPath: string;
  mode: "visual" | "text";
  visualResult: VisualDiffPage[] | null;
}

type PaneSide = "left" | "right";
type ExpectedScroll = { top: number; left: number } | null;

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

export function CompareViewer({ leftPath, rightPath, mode, visualResult }: Props) {
  const { t } = useTranslation("workspace");
  const left = usePdfDocument(leftPath);
  const right = usePdfDocument(rightPath);
  const [rawPage, setPage] = useState(0);
  const [zoom, setZoom] = useState(ZOOM_DEFAULT);
  const leftScrollerRef = useRef<HTMLDivElement>(null);
  const rightScrollerRef = useRef<HTMLDivElement>(null);
  const expectedScrollRef = useRef<Record<PaneSide, ExpectedScroll>>({
    left: null,
    right: null,
  });

  const maxPages = Math.max(left?.numPages ?? 0, right?.numPages ?? 0);
  const page = Math.min(rawPage, Math.max(0, maxPages - 1));
  const changedRatio = mode === "visual" ? visualResult?.[page]?.changed_pixel_ratio : null;

  useEffect(() => {
    expectedScrollRef.current = { left: null, right: null };
    for (const pane of [leftScrollerRef.current, rightScrollerRef.current]) {
      if (!pane) continue;
      pane.scrollTop = 0;
      pane.scrollLeft = 0;
    }
  }, [page]);

  function syncScroll(sourceSide: PaneSide) {
    const source = sourceSide === "left" ? leftScrollerRef.current : rightScrollerRef.current;
    const target = sourceSide === "left" ? rightScrollerRef.current : leftScrollerRef.current;
    const targetSide = sourceSide === "left" ? "right" : "left";
    if (!source || !target) return;

    const expected = expectedScrollRef.current[sourceSide];
    if (
      expected &&
      Math.abs(source.scrollTop - expected.top) <= 1 &&
      Math.abs(source.scrollLeft - expected.left) <= 1
    ) {
      expectedScrollRef.current[sourceSide] = null;
      return;
    }
    expectedScrollRef.current[sourceSide] = null;

    const top = mapSyncedScrollPosition(
      {
        offset: source.scrollTop,
        scrollSize: source.scrollHeight,
        viewportSize: source.clientHeight,
      },
      { scrollSize: target.scrollHeight, viewportSize: target.clientHeight },
    );
    const leftOffset = mapSyncedScrollPosition(
      {
        offset: source.scrollLeft,
        scrollSize: source.scrollWidth,
        viewportSize: source.clientWidth,
      },
      { scrollSize: target.scrollWidth, viewportSize: target.clientWidth },
    );
    expectedScrollRef.current[targetSide] = { top, left: leftOffset };
    target.scrollTop = top;
    target.scrollLeft = leftOffset;
  }

  if (!left || !right) {
    return <div className="p-6 text-[var(--color-text-muted)]">{t("compare.loading")}</div>;
  }

  return renderViewer(left, right);

  function renderViewer(left: NonNullable<ReturnType<typeof usePdfDocument>>, right: NonNullable<ReturnType<typeof usePdfDocument>>) {
    return (
      <section aria-label={t("compare.viewer_label")} className="flex h-full min-h-0 flex-col">
        <div className="flex min-h-12 items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-1.5 text-sm">
          <Button
            variant="outline"
            className="min-h-[var(--control-h)]"
            disabled={page === 0}
            onClick={() => setPage((current) => Math.max(0, current - 1))}
          >
            {t("compare.previous_page")}
          </Button>
          <span className="tabular-nums">
            {t("compare.page_of", { page: page + 1, pages: maxPages })}
          </span>
          <Button
            variant="outline"
            className="min-h-[var(--control-h)]"
            disabled={page >= maxPages - 1}
            onClick={() => setPage((current) => Math.min(maxPages - 1, current + 1))}
          >
            {t("compare.next_page")}
          </Button>
          {changedRatio != null && changedRatio > 0 ? (
            <span className="bg-[var(--color-warning-soft)] px-2 py-1 text-xs text-[var(--color-text)] tabular-nums">
              {t("compare.page_changed", { percent: (changedRatio * 100).toFixed(1) })}
            </span>
          ) : null}
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              className="min-h-[var(--control-h)] min-w-[var(--control-h)] px-0"
              aria-label={t("compare.zoom_out")}
              onClick={() => setZoom((current) => clampZoom(current - ZOOM_STEP))}
            >
              <Minus className="size-4" aria-hidden="true" />
            </Button>
            <button
              type="button"
              className="min-h-[var(--control-h)] min-w-14 rounded-md px-2 text-xs text-[var(--color-text-muted)] tabular-nums hover:text-[var(--color-text)]"
              title={t("compare.zoom_reset")}
              onClick={() => setZoom(ZOOM_DEFAULT)}
            >
              {Math.round(zoom * 100)}%
            </button>
            <Button
              variant="ghost"
              className="min-h-[var(--control-h)] min-w-[var(--control-h)] px-0"
              aria-label={t("compare.zoom_in")}
              onClick={() => setZoom((current) => clampZoom(current + ZOOM_STEP))}
            >
              <Plus className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-2 divide-x divide-[var(--color-border)]">
          <DocumentPane
            scrollerRef={leftScrollerRef}
            label={t("compare.left_document")}
            path={leftPath}
            pageAvailable={page < left.numPages}
            missingLabel={t("compare.missing_left")}
            onScroll={() => syncScroll("left")}
          >
            <PdfViewer pdf={left.pdf} pageIndex={page} zoom={zoom} className="border border-[var(--color-border)] bg-[var(--color-surface-raised)]" />
          </DocumentPane>
          <DocumentPane
            scrollerRef={rightScrollerRef}
            label={t("compare.right_document")}
            path={rightPath}
            pageAvailable={page < right.numPages}
            missingLabel={t("compare.missing_right")}
            onScroll={() => syncScroll("right")}
          >
            <PdfViewer pdf={right.pdf} pageIndex={page} zoom={zoom} className="border border-[var(--color-border)] bg-[var(--color-surface-raised)]" />
          </DocumentPane>
        </div>
      </section>
    );
  }
}

interface DocumentPaneProps {
  scrollerRef: React.Ref<HTMLDivElement>;
  label: string;
  path: string;
  pageAvailable: boolean;
  missingLabel: string;
  onScroll: () => void;
  children: React.ReactNode;
}

function DocumentPane({
  scrollerRef,
  label,
  path,
  pageAvailable,
  missingLabel,
  onScroll,
  children,
}: DocumentPaneProps) {
  return (
    <div
      ref={scrollerRef}
      className="min-w-0 overflow-auto bg-[var(--color-well)]"
      onScroll={onScroll}
    >
      <div className="sticky top-0 z-10 flex min-h-[var(--control-h)] items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 text-xs">
        <span className="font-medium">{label}</span>
        <span className="truncate text-[var(--color-text-muted)]" title={path}>
          {fileName(path)}
        </span>
      </div>
      <div className="flex min-h-full min-w-max items-start justify-center p-4">
        {pageAvailable ? children : <Placeholder label={missingLabel} />}
      </div>
    </div>
  );
}

function Placeholder({ label }: { label: string }) {
  return (
    <div className="flex h-48 w-32 items-center justify-center border border-dashed border-[var(--color-border)] text-xs text-[var(--color-text-muted)]">
      {label}
    </div>
  );
}
