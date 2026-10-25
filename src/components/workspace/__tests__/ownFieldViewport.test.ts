// @vitest-environment node
import { expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, rmdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build, stop } from "esbuild";

// Plan 119 §2.3 T3. Real pdf.js document and viewports, never a viewport fake.
// A minimal fixture with an empty 612 x 792 page; pdf.js recovers its xref.
const PDF = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >> endobj
trailer << /Root 1 0 R >>
%%EOF`;

// The optional native canvas module crashes on Windows when loaded inside
// a thread worker. A Node child keeps the real PDF and the real helper,
// while the Vitest suite can still use its normal thread pool.
const RUNNER = `
  const { getDocument } = await import(process.argv[1]);
  const { toPdfRect } = await import(process.argv[2]);
  const task = getDocument({ data: new Uint8Array(Buffer.from(process.argv[3], "base64")) });
  let rects;
  try {
    const doc = await task.promise;
    const page = await doc.getPage(1);
    const screen = { x: 100, y: 50, width: 140, height: 22 };
    rects = [
      toPdfRect(screen, page.getViewport({ scale: 1, rotation: 0 })),
      toPdfRect(screen, page.getViewport({ scale: 1, rotation: 90 })),
      toPdfRect({ x: 25, y: 12.5, width: 35, height: 5.5 }, page.getViewport({ scale: 0.25, rotation: 0 })),
      toPdfRect({ x: 400, y: 200, width: 560, height: 88 }, page.getViewport({ scale: 4, rotation: 0 })),
    ];
  } finally {
    await task.destroy();
  }
  console.log(JSON.stringify(rects));
`;

async function viewportRects(): Promise<unknown> {
  const scratch = mkdtempSync(join(tmpdir(), "pdf-editor-viewport-"));
  const geometry = join(scratch, "geometry.mjs");
  try {
    const bundle = await build({
      entryPoints: [fileURLToPath(new URL("../pendingAnnotationGeometry.ts", import.meta.url))],
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    writeFileSync(geometry, bundle.outputFiles[0].text);
    const pdfjs = createRequire(import.meta.url).resolve("pdfjs-dist/legacy/build/pdf.mjs");
    const output = execFileSync(process.execPath, [
      "--input-type=module", "--eval", RUNNER,
      pathToFileURL(pdfjs).href, pathToFileURL(geometry).href,
      Buffer.from(PDF).toString("base64"),
    ], { encoding: "utf8", timeout: 20_000, windowsHide: true });
    return JSON.parse(output.trim().split(/\r?\n/).at(-1) ?? "");
  } finally {
    await stop();
    rmSync(geometry, { force: true });
    rmdirSync(scratch);
  }
}

it("T3 converts the screen box through real rotation 0 and 90 viewports and 25/400 percent zoom", async () => {
  expect(await viewportRects()).toEqual([
    [100, 720, 240, 742],
    [50, 100, 72, 240],
    [100, 720, 240, 742],
    [100, 720, 240, 742],
  ]);
});
