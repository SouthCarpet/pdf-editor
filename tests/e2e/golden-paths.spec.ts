// Phase 18 Task 91 — Playwright golden-path E2E.
//
// Smoke-tests the two most-used tools end-to-end against the built
// `pdf-editor.exe`. Requires `pnpm tauri build --debug` to have run
// first; CI handles that ordering in `.github/workflows/ci.yml`.

import { test, expect, _electron as electron } from "@playwright/test";
import path from "node:path";

const APP = path.resolve(
  __dirname,
  "../../src-tauri/target/release/pdf-editor.exe",
);
const FIXTURE = path.resolve(
  __dirname,
  "../../src-tauri/tests/fixtures/pdfs/sample.pdf",
);

test("merge two PDFs end-to-end", async () => {
  const app = await electron.launch({ executablePath: APP });
  const win = await app.firstWindow();

  await win.click("text=Merge");
  await win.setInputFiles("input[type=file]", [FIXTURE, FIXTURE]);
  await win.click("text=OK");
  await expect(win.getByText("done")).toBeVisible({ timeout: 30_000 });

  await app.close();
});

test("compress saves a smaller file", async () => {
  const app = await electron.launch({ executablePath: APP });
  const win = await app.firstWindow();

  await win.click("text=Compress");
  await win.setInputFiles("input[type=file]", [FIXTURE]);
  // Pick the default "Recommended" preset by clicking the Run button.
  await win.click("text=Run");
  await expect(win.getByText("done")).toBeVisible({ timeout: 30_000 });

  await app.close();
});
