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
import { describe, expect, it } from "vitest";
import { decodeDocId } from "@/lib/docId";

describe("decodeDocId", () => {
  it("decodes a path with spaces and dots", () => {
    // Same path shape as the on-screen diagnostic, with neutral names.
    const fromRoute = "C%3A%5CUsers%5Cuser%5CDownloads%5Ctimesheet%2023.10.2024%20.pdf";
    expect(decodeDocId(fromRoute)).toBe(
      "C:\\Users\\user\\Downloads\\timesheet 23.10.2024 .pdf",
    );
  });

  it.each([
    "C:\\Users\\user\\Downloads\\timesheet 23.10.2024 .pdf",
    "C:\\documents\\a file with spaces.pdf",
    "C:\\Users\\user\\Documents\\document (2) [final].pdf",
    "C:\\Users\\user\\Dokumenty\\ukážka č. 5 – október.pdf",
    "C:\\path\\with#hash&amp.pdf",
  ])("round-trips the navigation encoding for %s", (path) => {
    // DocumentTabs, OpenFilesProvider and the recent-files list all encode with
    // encodeURIComponent, so the decode has to be its exact inverse.
    expect(decodeDocId(encodeURIComponent(path))).toBe(path);
  });

  it("returns the raw value instead of throwing on a lone percent", () => {
    // decodeURIComponent throws URIError on an invalid escape. A Windows path
    // may legitimately contain a bare %, and trading file_not_found for an
    // uncaught crash would be a worse bug than the one being fixed.
    const raw = "C:\\Users\\user\\Downloads\\100% done.pdf";
    expect(() => decodeDocId(raw)).not.toThrow();
    expect(decodeDocId(raw)).toBe(raw);
  });

  it("leaves the sentinel alone", () => {
    expect(decodeDocId("new")).toBe("new");
  });
});
