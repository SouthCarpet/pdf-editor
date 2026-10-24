// @vitest-environment node
import { expect, it } from "vitest";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { toPdfRect } from "../pendingAnnotationGeometry";

// Plan 119 §2.3 T3. Real pdf.js document and viewports, never a viewport fake.
// A minimal fixture with an empty 612 x 792 page; pdf.js recovers its xref.
const PDF = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >> endobj
trailer << /Root 1 0 R >>
%%EOF`;

it("T3 converts the screen box through real rotation 0 and 90 viewports", async () => {
  const task = getDocument({ data: new TextEncoder().encode(PDF) });
  const doc = await task.promise;
  try {
    const page = await doc.getPage(1);
    const screen = { x: 100, y: 50, width: 140, height: 22 };
    expect(toPdfRect(screen, page.getViewport({ scale: 1, rotation: 0 }))).toEqual([100, 720, 240, 742]);
    expect(toPdfRect(screen, page.getViewport({ scale: 1, rotation: 90 }))).toEqual([50, 100, 72, 240]);
  } finally {
    await task.destroy();
  }
});
