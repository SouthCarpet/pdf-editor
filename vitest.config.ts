import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // Phase 18 Task 91/90f/90k: Playwright E2E tests live under tests/e2e
    // and are driven via `pnpm test:e2e`, not vitest.
    exclude: ["node_modules", "dist", "tests/e2e/**"],
  },
});
