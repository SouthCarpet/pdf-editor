// Loads a PDF into PDF.js by reading the file bytes through tauri-plugin-fs
// (rather than `file://` URLs, which Tauri 2's CSP blocks). Uint8Array is
// exactly what `pdfjs.getDocument({ data })` wants.
import { useEffect, useState } from "react";
import { readFile } from "@tauri-apps/plugin-fs";
import * as pdfjs from "pdfjs-dist";
// `?url` makes Vite emit the worker as a chunk and hand us its URL.
// pdfjs ships an ESM worker; the .mjs path is the canonical entry.
// @ts-expect-error vite asset import
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc as string;

export interface PdfDoc {
  pdf: pdfjs.PDFDocumentProxy;
  numPages: number;
}

export function usePdfDocument(path: string | null): PdfDoc | null {
  // Key the cached doc to the path it was loaded for; whenever `path`
  // changes we render null synchronously and the effect (re)loads.
  const [entry, setEntry] = useState<{ path: string; doc: PdfDoc } | null>(null);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    (async () => {
      const bytes = await readFile(path);
      // pdfjs takes ownership of the buffer it reads, so spread into a
      // fresh Uint8Array to keep the reference stable across re-renders.
      const data = new Uint8Array(bytes);
      const pdf = await pdfjs.getDocument({ data }).promise;
      if (cancelled) {
        // Best-effort destroy if we lost the race with cancellation.
        pdf.destroy();
        return;
      }
      setEntry({ path, doc: { pdf, numPages: pdf.numPages } });
    })().catch((err) => {
      console.error("usePdfDocument failed:", err);
    });
    return () => {
      cancelled = true;
    };
  }, [path]);

  // Only return the cached doc if it matches the currently requested path.
  // Otherwise the consumer sees `null` until the effect resolves the new doc.
  return path && entry?.path === path ? entry.doc : null;
}
