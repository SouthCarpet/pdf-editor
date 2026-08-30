import { describe, expect, it } from "vitest";
import {
  standardFontPostScriptName,
  standardFontPreviewFamily,
  type StandardTextFamily,
} from "../standardTextStyle";

describe("standardFontPostScriptName", () => {
  it.each<[StandardTextFamily, boolean, boolean, string]>([
    ["Helvetica", false, false, "Helvetica"],
    ["Helvetica", true, false, "Helvetica-Bold"],
    ["Helvetica", false, true, "Helvetica-Oblique"],
    ["Helvetica", true, true, "Helvetica-BoldOblique"],
    ["Times", false, false, "Times-Roman"],
    ["Times", true, false, "Times-Bold"],
    ["Times", false, true, "Times-Italic"],
    ["Times", true, true, "Times-BoldItalic"],
    ["Courier", false, false, "Courier"],
    ["Courier", true, false, "Courier-Bold"],
    ["Courier", false, true, "Courier-Oblique"],
    ["Courier", true, true, "Courier-BoldOblique"],
  ])("maps %s bold=%s italic=%s to %s", (family, bold, italic, expected) => {
    expect(standardFontPostScriptName(family, bold, italic)).toBe(expected);
  });
});

describe("standardFontPreviewFamily", () => {
  it("uses the Helvetica sans-serif stack", () => {
    expect(standardFontPreviewFamily("Helvetica")).toBe(
      '"Helvetica Neue", Helvetica, Arial, sans-serif'
    );
  });

  it("uses the Times serif stack", () => {
    expect(standardFontPreviewFamily("Times")).toBe('"Times New Roman", Times, serif');
  });

  it("uses the Courier monospace stack", () => {
    expect(standardFontPreviewFamily("Courier")).toBe('"Courier New", Courier, monospace');
  });
});
