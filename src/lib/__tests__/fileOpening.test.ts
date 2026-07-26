import { describe, expect, it } from "vitest";
import { composeMergeInputs, movePath, normalizePdfPaths } from "../fileOpening";

describe("file opening helpers", () => {
  it("keeps only unique PDF paths while preserving input order", () => {
    expect(
      normalizePdfPaths([
        "C:\\Docs\\First.PDF",
        "C:\\Docs\\notes.txt",
        "c:/docs/first.pdf",
        "C:\\Docs\\Second.pdf",
      ])
    ).toEqual(["C:\\Docs\\First.PDF", "C:\\Docs\\Second.pdf"]);
  });

  it("moves a path without mutating the source list", () => {
    const source = ["a.pdf", "b.pdf", "c.pdf"];
    expect(movePath(source, 2, 0)).toEqual(["c.pdf", "a.pdf", "b.pdf"]);
    expect(source).toEqual(["a.pdf", "b.pdf", "c.pdf"]);
  });

  it("places dropped files before or after the active document", () => {
    const dropped = ["a.pdf", "b.pdf"];
    expect(composeMergeInputs(dropped, "active.pdf", "before")).toEqual([
      "a.pdf",
      "b.pdf",
      "active.pdf",
    ]);
    expect(composeMergeInputs(dropped, "active.pdf", "after")).toEqual([
      "active.pdf",
      "a.pdf",
      "b.pdf",
    ]);
  });

  it("does not add the active document twice", () => {
    expect(composeMergeInputs(["A.pdf", "b.pdf"], "a.PDF", "after")).toEqual(["A.pdf", "b.pdf"]);
  });
});
