export const STANDARD_TEXT_FAMILIES = ["Helvetica", "Times", "Courier"] as const;

export type StandardTextFamily = (typeof STANDARD_TEXT_FAMILIES)[number];

export function standardFontPostScriptName(
  family: StandardTextFamily,
  bold: boolean,
  italic: boolean
): string {
  switch (family) {
    case "Helvetica":
      if (bold && italic) return "Helvetica-BoldOblique";
      if (bold) return "Helvetica-Bold";
      if (italic) return "Helvetica-Oblique";
      return "Helvetica";
    case "Times":
      if (bold && italic) return "Times-BoldItalic";
      if (bold) return "Times-Bold";
      if (italic) return "Times-Italic";
      return "Times-Roman";
    case "Courier":
      if (bold && italic) return "Courier-BoldOblique";
      if (bold) return "Courier-Bold";
      if (italic) return "Courier-Oblique";
      return "Courier";
  }
}

export function standardFontPreviewFamily(family: string): string {
  switch (family) {
    case "Times":
      return '"Times New Roman", Times, serif';
    case "Courier":
      return '"Courier New", Courier, monospace';
    default:
      return '"Helvetica Neue", Helvetica, Arial, sans-serif';
  }
}
