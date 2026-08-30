import { describe, expect, it, vi } from "vitest";
import type { OpenDocument } from "@/stores/documentStore";
import { openPaths, type OpenPathsDependencies } from "../openPaths";

function opened(path: string) {
  return { status: "ok" as const, data: { path, page_count: 3 } };
}

describe("openPaths", () => {
  it("de-duplicates new paths and focuses the last opened PDF", async () => {
    const documents = new Map<string, OpenDocument>();
    const focusDocument = vi.fn(async () => {});
    const openDocument = vi.fn(async (path: string) => opened(path));
    const dependencies: OpenPathsDependencies = {
      listDocuments: () => documents.values(),
      openDocument,
      addDocument: (document) => documents.set(document.id, document),
      initializeZoom: vi.fn(),
      focusDocument,
    };

    const result = await openPaths(
      ["C:\\Docs\\first.pdf", "c:/docs/FIRST.PDF", "C:\\Docs\\second.pdf"],
      dependencies,
    );

    expect(openDocument).toHaveBeenCalledTimes(2);
    expect(result.opened).toBe(2);
    expect(focusDocument).toHaveBeenCalledOnce();
    expect(focusDocument).toHaveBeenCalledWith("C:\\Docs\\second.pdf");
  });

  it("focuses an already-open path without opening a duplicate tab", async () => {
    const existing: OpenDocument = {
      id: "C:/Docs/form.pdf",
      path: "C:/Docs/form.pdf",
      pageCount: 2,
      dirty: false,
    };
    const openDocument = vi.fn(async (path: string) => opened(path));
    const focusDocument = vi.fn(async () => {});

    const result = await openPaths(["c:\\docs\\FORM.PDF"], {
      listDocuments: () => [existing],
      openDocument,
      addDocument: vi.fn(),
      initializeZoom: vi.fn(),
      focusDocument,
    });

    expect(openDocument).not.toHaveBeenCalled();
    expect(result.opened).toBe(0);
    expect(focusDocument).toHaveBeenCalledWith("C:/Docs/form.pdf");
  });
});
