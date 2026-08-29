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
test("app shell makes zero outbound network requests", async () => {
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

  await expect(win.getByRole("link", { name: "Merge" })).toBeVisible();

  expect(requests).toEqual([]);
  await app.close();
});
});
