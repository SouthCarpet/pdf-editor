import type { OpenDocument } from "@/stores/documentStore";
import { filterPdfPaths, pathKey } from "@/lib/fileOpening";

interface OpenedDocumentData {
  path: string;
  page_count: number;
}

type OpenDocumentResult =
  | { status: "ok"; data: OpenedDocumentData }
  | { status: "error"; error: unknown };

export interface OpenPathsDependencies {
  listDocuments: () => Iterable<OpenDocument>;
  openDocument: (path: string) => Promise<OpenDocumentResult>;
  addDocument: (document: OpenDocument) => void;
  initializeZoom: (path: string) => void;
  focusDocument: (path: string) => Promise<void>;
}

export interface OpenPathsResult {
  opened: number;
  failed: number;
  ignored: number;
  focusedPath: string | null;
}

/** Opens PDFs as tabs, de-duplicates paths, and focuses the last usable path. */
export async function openPaths(
  paths: string[],
  dependencies: OpenPathsDependencies,
): Promise<OpenPathsResult> {
  const pdfPaths = filterPdfPaths(paths);
  const documentsByPath = new Map(
    Array.from(dependencies.listDocuments(), (document) => [pathKey(document.path), document]),
  );
  const queued = new Set<string>();
  let opened = 0;
  let failed = 0;
  let focusedPath: string | null = null;

  for (const path of pdfPaths) {
    const key = pathKey(path);
    if (queued.has(key)) continue;
    queued.add(key);

    const existing = documentsByPath.get(key);
    if (existing) {
      focusedPath = existing.path;
      continue;
    }

    let result: OpenDocumentResult;
    try {
      result = await dependencies.openDocument(path);
    } catch {
      failed += 1;
      continue;
    }
    if (result.status === "error") {
      failed += 1;
      continue;
    }

    const document: OpenDocument = {
      id: result.data.path,
      path: result.data.path,
      pageCount: result.data.page_count,
      dirty: false,
    };
    dependencies.addDocument(document);
    dependencies.initializeZoom(document.path);
    documentsByPath.set(pathKey(document.path), document);
    focusedPath = document.path;
    opened += 1;
  }

  if (focusedPath) await dependencies.focusDocument(focusedPath);

  return {
    opened,
    failed,
    ignored: paths.length - pdfPaths.length,
    focusedPath,
  };
}
