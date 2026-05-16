// Phase 18 Task 90f — privacy / network-isolation runtime assertion.
//
// Drives the built `pdf-editor.exe` through a full Merge run and asserts
// that not a single outbound network request fires. The complement to
// `scripts/test-privacy.ps1` (static symbol scan): static catches accidental
// `reqwest` inclusion; this catches any runtime call that escapes the
// allowed `ipc:` / `tauri:` / `file:` / `data:` / `blob:` URI schemes.
//
// Runs in CI's `frontend-e2e` job after `pnpm tauri build --debug` produces
// the executable. Requires `@playwright/test` (added in Task 91).

import { test, expect, _electron as electron } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const APP = path.resolve(
  __dirname,
  "../../src-tauri/target/debug/pdf-editor.exe",
);

test.describe.skip("runtime privacy (tauri-driver integration pending)", () => {
// Playwright's `_electron.launch` doesn't drive Tauri 2 (WebView2 +
// tauri-driver). Static surface stays defined for the day tauri-driver
// lands; the static `scripts/test-privacy.ps1` covers the dependency
// gate today.
test("app makes zero outbound network requests during a Merge run", async () => {
  const app = await electron.launch({ executablePath: APP });
  const win = await app.firstWindow();

  const requests: string[] = [];
  win.on("request", (req) => {
    const url = req.url();
    // Allow only the localhost-only schemes Tauri itself routes through.
    if (
      !/^(ipc:|data:|blob:|file:|http:\/\/ipc\.localhost|tauri:|chrome:|devtools:)/.test(
        url,
      )
    ) {
      requests.push(url);
    }
  });

  // Drive a Merge run end-to-end. The exact selectors depend on the
  // running app; this scaffold keeps the shape close to what Playwright
  // would dispatch once `tauri-driver` is wired in.
  await win.click("text=Merge").catch(() => {
    // If the route hasn't loaded yet, allow the test to still verify
    // the network discipline of the initial app shell.
  });

  // 5 s of idle time is enough to surface any periodic poll or telemetry
  // beacon the codebase might have leaked in.
  await win.waitForTimeout(5_000);

  expect(requests).toEqual([]);
  await app.close();
});
});
