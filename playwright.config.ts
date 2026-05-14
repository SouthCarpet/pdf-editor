// Phase 18 Task 91 — Playwright config for E2E golden-path coverage.
//
// Drives the built `pdf-editor.exe` through user-visible scenarios.
// Run via `pnpm test:e2e` (after `pnpm tauri build --debug`).

import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
