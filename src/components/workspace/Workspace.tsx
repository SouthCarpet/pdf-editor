// Top-level Workspace shell. Holds the tool picker, the virtualized
// thumbnail strip, the main PDF canvas (PDF.js), and a right-hand slot
// where active-tool panels will live (filled in by Phase 11+). The
// PDF document itself is loaded by the route via `usePdfDocument`.
import type * as pdfjs from "pdfjs-dist";
import { useEffect } from "react";
import { useWorkspace } from "@/stores/workspaceStore";
import { PdfViewer } from "./PdfViewer";
import { ThumbnailStrip } from "./ThumbnailStrip";
import { WorkspaceTopBar } from "./WorkspaceTopBar";

interface Props {
  pdf: pdfjs.PDFDocumentProxy;
}

export function Workspace({ pdf }: Props) {
  const activePage = useWorkspace((s) => s.activePage);
  const setActivePage = useWorkspace((s) => s.setActivePage);
  const zoom = useWorkspace((s) => s.zoom);

  // Clamp active page when the document changes (defensive).
  useEffect(() => {
    if (activePage >= pdf.numPages) setActivePage(0);
  }, [pdf, activePage, setActivePage]);

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col">
      <WorkspaceTopBar />
      <div className="flex flex-1 overflow-hidden">
        <aside className="shrink-0 border-r border-[var(--color-border)] bg-[var(--color-card)]">
          <ThumbnailStrip
            pdf={pdf}
            active={activePage}
            onSelect={setActivePage}
            height={typeof window !== "undefined" ? window.innerHeight - 96 : 600}
          />
        </aside>
        <main className="flex flex-1 items-start justify-center overflow-auto bg-[var(--color-background)] p-6">
          <div className="relative">
            <PdfViewer pdf={pdf} pageIndex={activePage} zoom={zoom} className="shadow-lg" />
          </div>
        </main>
        <aside className="w-72 shrink-0 border-l border-[var(--color-border)] bg-[var(--color-card)] p-3">
          {/* Tool panel slot — filled in by Phase 11+ */}
        </aside>
      </div>
    </div>
  );
}
