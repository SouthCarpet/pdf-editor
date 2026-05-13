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
  const [doc, setDoc] = useState<PdfDoc | null>(null);

  useEffect(() => {
    if (!path) {
      setDoc(null);
      return;
    }
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
      setDoc({ pdf, numPages: pdf.numPages });
    })().catch((err) => {
      // eslint-disable-next-line no-console
      console.error("usePdfDocument failed:", err);
    });
    return () => {
      cancelled = true;
    };
  }, [path]);

  return doc;
}
