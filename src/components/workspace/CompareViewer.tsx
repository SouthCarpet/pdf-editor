// Phase 11 Task 65 — Compare viewer.
//
// Two PDF.js viewers side-by-side with synchronized scrolling. Both
// instances share a single page index controlled by this component;
// when either side has fewer pages, the shorter side renders nothing
// for the missing pages.
import { useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { usePdfDocument } from "@/hooks/usePdfDocument";
import { Button } from "@/components/ui/button";
import type { TextDiffResult, VisualDiffPage } from "@/bindings";
import { PdfViewer } from "./PdfViewer";

interface Props {
  leftPath: string;
  rightPath: string;
  mode: "visual" | "text";
  visualResult: VisualDiffPage[] | null;
  textResult: TextDiffResult | null;
}

export function CompareViewer({ leftPath, rightPath, mode, visualResult, textResult }: Props) {
  const left = usePdfDocument(leftPath);
  const right = usePdfDocument(rightPath);
  const [rawPage, setPage] = useState(0);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const maxPages = Math.max(left?.numPages ?? 0, right?.numPages ?? 0);
  // Clamp on render rather than via an effect to avoid the
  // set-state-in-effect lint and the cascading re-render it warns about.
  const page = Math.min(rawPage, Math.max(0, maxPages - 1));

  if (!left || !right) {
    return (
      <div className="p-6 text-[var(--color-muted)]">Loading documents…</div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-sm">
        <Button
          size="sm"
          variant="outline"
          disabled={page === 0}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
        >
          ← Prev
        </Button>
        <span>
          Page {page + 1} / {maxPages}
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={page >= maxPages - 1}
          onClick={() => setPage((p) => Math.min(maxPages - 1, p + 1))}
        >
          Next →
        </Button>
      </div>
      <div ref={scrollerRef} className="flex flex-1 overflow-auto">
        <div className="flex flex-1 items-start justify-center gap-3 p-4">
          <div className="rounded border bg-white p-2 shadow-sm">
            <div className="mb-1 text-xs text-[var(--color-muted)]">Left</div>
            {page < left.numPages ? (
              <PdfViewer pdf={left.pdf} pageIndex={page} zoom={0.8} />
            ) : (
              <Placeholder label="(missing on left)" />
            )}
          </div>
          {mode === "visual" && visualResult ? (
            <div className="rounded border bg-white p-2 shadow-sm">
              <div className="mb-1 text-xs text-[var(--color-muted)]">Diff</div>
              {visualResult[page] ? (
                <img
                  src={convertFileSrc(visualResult[page].diff_image)}
                  alt={`diff page ${page + 1}`}
                  className="max-w-[400px]"
                />
              ) : (
                <Placeholder label="(no diff)" />
              )}
            </div>
          ) : null}
          <div className="rounded border bg-white p-2 shadow-sm">
            <div className="mb-1 text-xs text-[var(--color-muted)]">Right</div>
            {page < right.numPages ? (
              <PdfViewer pdf={right.pdf} pageIndex={page} zoom={0.8} />
            ) : (
              <Placeholder label="(missing on right)" />
            )}
          </div>
        </div>
      </div>
      {mode === "text" && textResult ? (
        <div className="max-h-48 overflow-auto border-t bg-[var(--color-card)] p-2 text-xs">
          <div className="mb-1 font-medium">Text differences</div>
          {textResult.changes.length === 0 ? (
            <p className="text-[var(--color-muted)]">No textual differences detected.</p>
          ) : (
            <ul className="space-y-1">
              {textResult.changes.map((c, i) => (
                <li key={i}>
                  {c.kind === "delete" && (
                    <span className="bg-red-100 px-1 text-red-800 line-through">
                      {c.left}
                    </span>
                  )}
                  {c.kind === "insert" && (
                    <span className="bg-green-100 px-1 text-green-800">{c.right}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Placeholder({ label }: { label: string }) {
  return (
    <div className="flex h-48 w-32 items-center justify-center border border-dashed text-xs text-[var(--color-muted)]">
      {label}
    </div>
  );
}
