import { describe, it, expect } from "vitest";
import { countForm, pluralLabel } from "../plural";

describe("countForm", () => {
  it("uses one and other for English", () => {
    expect([0, 1, 2, 5, 21].map((n) => countForm("en", n))).toEqual([
      "other",
      "one",
      "other",
      "other",
      "other",
    ]);
  });

  it("uses one, few and other for Slovak whole numbers", () => {
    expect([0, 1, 2, 3, 4, 5, 11, 22, 100].map((n) => countForm("sk", n))).toEqual([
      "other",
      "one",
      "few",
      "few",
      "few",
      "other",
      "other",
      "other",
      "other",
    ]);
  });

  it("folds a fraction (Slovak many) into other", () => {
    expect(countForm("sk", 1.5)).toBe("other");
  });
});

describe("pluralLabel", () => {
  const forms = { one: "súbor", few: "súbory", other: "súborov" };
  it("picks the Slovak form for 1, 2 to 4 and 5 or more", () => {
    expect([1, 2, 4, 5].map((n) => pluralLabel("sk", n, forms))).toEqual([
      "súbor",
      "súbory",
      "súbory",
      "súborov",
    ]);
  });
});
