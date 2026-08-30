import { describe, expect, it } from "vitest";
import { saveDialogDefaultDir } from "../documentSave";

describe("saveDialogDefaultDir", () => {
  it("returns the configured folder when one is set, ignoring the document path", () => {
    expect(saveDialogDefaultDir("A:\\docs\\form.pdf", "D:\\filled")).toBe("D:\\filled");
    expect(saveDialogDefaultDir("C:/docs/form.pdf", "E:/saves")).toBe("E:/saves");
  });

  it("returns the document's parent folder when no default save folder is set", () => {
    expect(saveDialogDefaultDir("A:\\docs\\form.pdf", null)).toBe("A:\\docs");
    expect(saveDialogDefaultDir("C:/work/form.pdf", null)).toBe("C:/work");
  });

  it("returns an empty string when the document path has no parent folder", () => {
    expect(saveDialogDefaultDir("form.pdf", null)).toBe("");
  });
});
