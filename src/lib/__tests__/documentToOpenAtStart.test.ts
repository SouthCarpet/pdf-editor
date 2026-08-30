import { describe, expect, it } from "vitest";
import { documentToOpenAtStart } from "../documentToOpenAtStart";

const RECENT = [
  { path: "C:/forms/latest.pdf" },
  { path: "C:/forms/older.pdf" },
];

describe("documentToOpenAtStart", () => {
  it("returns null when the setting is off, even if the latest file exists", () => {
    expect(
      documentToOpenAtStart(false, RECENT, (path) => path === "C:/forms/latest.pdf"),
    ).toBeNull();
  });

  it("returns null when the recent list is empty", () => {
    expect(documentToOpenAtStart(true, [], () => true)).toBeNull();
  });

  it("returns the most recent path when the setting is on and that file exists", () => {
    expect(
      documentToOpenAtStart(true, RECENT, (path) => path === "C:/forms/latest.pdf"),
    ).toBe("C:/forms/latest.pdf");
  });

  it("returns null when the most recent file is gone, without falling through to an older file", () => {
    expect(
      documentToOpenAtStart(true, RECENT, (path) => path === "C:/forms/older.pdf"),
    ).toBeNull();
  });
});
