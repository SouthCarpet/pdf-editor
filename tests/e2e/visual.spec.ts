// Phase 18 Task 90k — visual regression screenshot suite.
//
// Pixel-level snapshots of each top-level surface. Run via Playwright
// against the `pnpm tauri build --debug` output once Task 91 wires
// `tauri-driver`. Snapshots land under `tests/e2e/__screenshots__/` and
// the diff threshold is 1% (anything above fails CI; locally, refresh
// with `pnpm exec playwright test --update-snapshots`).

import { test, expect, _electron as electron } from "@playwright/test";
import path from "node:path";

const APP = path.resolve(
  __dirname,
  "../../src-tauri/target/release/pdf-editor.exe",
);

const DIFF_RATIO = 0.01;

async function launch() {
  const app = await electron.launch({ executablePath: APP });
  const win = await app.firstWindow();
  return { app, win };
}

test("dashboard matches snapshot", async () => {
  const { app, win } = await launch();
  await expect(win).toHaveScreenshot("dashboard.png", {
    maxDiffPixelRatio: DIFF_RATIO,
  });
  await app.close();
});

test("dashboard in dark mode matches snapshot", async () => {
  const { app, win } = await launch();
  await win.evaluate(() => {
    document.documentElement.classList.add("dark");
  });
  await expect(win).toHaveScreenshot("dashboard-dark.png", {
    maxDiffPixelRatio: DIFF_RATIO,
  });
  await app.close();
});

const TOOL_ROUTES = [
  ["merge", "/tools/merge"],
  ["split", "/tools/split"],
  ["extract", "/tools/extract"],
  ["compress", "/tools/compress"],
  ["optimize", "/tools/optimize"],
  ["unlock", "/tools/unlock"],
  ["convert-export", "/tools/convert/export"],
  ["convert-import", "/tools/convert/import"],
] as const;

for (const [name, route] of TOOL_ROUTES) {
  test(`${name} tool page matches snapshot`, async () => {
    const { app, win } = await launch();
    await win.evaluate((r) => {
      // TanStack Router exposes history navigation via the window
      // object once the app boots; this is a simpler-than-clicking
      // approach for snapshot tests.
      window.history.pushState({}, "", r);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }, route);
    await expect(win).toHaveScreenshot(`${name}.png`, {
      maxDiffPixelRatio: DIFF_RATIO,
    });
    await app.close();
  });
}

test("settings page matches snapshot", async () => {
  const { app, win } = await launch();
  await win.evaluate(() => {
    window.history.pushState({}, "", "/settings");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(win).toHaveScreenshot("settings.png", {
    maxDiffPixelRatio: DIFF_RATIO,
  });
  await app.close();
});

test("pipeline page matches snapshot", async () => {
  const { app, win } = await launch();
  await win.evaluate(() => {
    window.history.pushState({}, "", "/pipeline");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(win).toHaveScreenshot("pipeline.png", {
    maxDiffPixelRatio: DIFF_RATIO,
  });
  await app.close();
});

test("projects page matches snapshot", async () => {
  const { app, win } = await launch();
  await win.evaluate(() => {
    window.history.pushState({}, "", "/projects");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(win).toHaveScreenshot("projects.png", {
    maxDiffPixelRatio: DIFF_RATIO,
  });
  await app.close();
});
