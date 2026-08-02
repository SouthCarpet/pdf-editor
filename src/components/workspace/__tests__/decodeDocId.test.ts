// Regression test for the "Subor sa nenasiel" bug, 2026-08-02.
//
// The route param arrives percent-encoded, but a comment in WorkspaceRoute
// asserted the router had already decoded it, so openDocument was handed the
// literal string "C%3A%5CUsers%5C..." and reported file_not_found for a path
// that does not exist. Nobody noticed because the picker and drag-and-drop pass
// an absolute path straight through without crossing the router, and the one
// entry point that DID cross it, the recent-files list, was not clickable.
//
// The two defects hid each other. This test covers the decode; the clickable
// list is what exercises the route in the first place.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { decodeDocId } from "@/lib/docId";

describe("decodeDocId", () => {
  it("decodes the exact path from the reported failure", () => {
    // Copied verbatim from the on-screen diagnostic.
    const fromRoute = "C%3A%5CUsers%5CAsus%5CDownloads%5Chodinovka%2023.10.2024%20.pdf";
    expect(decodeDocId(fromRoute)).toBe(
      "C:\\Users\\Asus\\Downloads\\hodinovka 23.10.2024 .pdf",
    );
  });

  it("round-trips whatever the navigation side encodes", () => {
    // DocumentTabs, OpenFilesProvider and the recent-files list all encode with
    // encodeURIComponent, so the decode has to be its exact inverse.
    for (const p of [
      "C:\\Users\\Asus\\Downloads\\hodinovka 23.10.2024 .pdf",
      "D:\\projects-vault\\a file with spaces.pdf",
      "C:\\Users\\Asus\\Documents\\zmluva (2) [final].pdf",
      "C:\\Users\\Asus\\Dokumenty\\faktúra č. 5 – október.pdf",
      "C:\\path\\with#hash&amp.pdf",
    ]) {
      expect(decodeDocId(encodeURIComponent(p))).toBe(p);
    }
  });

  it("returns the raw value instead of throwing on a lone percent", () => {
    // decodeURIComponent throws URIError on an invalid escape. A Windows path
    // may legitimately contain a bare %, and trading file_not_found for an
    // uncaught crash would be a worse bug than the one being fixed.
    const raw = "C:\\Users\\Asus\\Downloads\\100% done.pdf";
    expect(() => decodeDocId(raw)).not.toThrow();
    expect(decodeDocId(raw)).toBe(raw);
  });

  it("leaves the sentinel alone", () => {
    expect(decodeDocId("new")).toBe("new");
  });
});

describe("decodeDocId is actually wired into the route", () => {
  // The tests above pass whether or not WorkspaceRoute calls decodeDocId, so on
  // their own they cannot fail on the bug they were written for - the defect was
  // never in the function, it was that nothing called one. WorkspaceRoute cannot
  // be rendered here (it imports pdfjs, which needs DOMMatrix), so assert on the
  // source instead. A source assertion is a blunt instrument and is used
  // deliberately: it is the only check available that fails if the call is
  // removed.
  it("passes the param through decodeDocId before loading", () => {
    // `import.meta.url` is not a file: URL under Vitest, so resolve from the
    // project root instead (cwd is the package root when vitest runs).
    const src = readFileSync(
      resolve("src/components/workspace/WorkspaceRoute.tsx"),
      "utf8",
    );
    expect(src).toContain("loadAndRegister(decodeDocId(docId))");
    expect(src).not.toMatch(/loadAndRegister\(\s*docId\s*\)/);
  });
});
