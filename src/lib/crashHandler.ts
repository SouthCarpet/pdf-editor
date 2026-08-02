// Delta P: frontend global crash handlers.
//
// React's error boundaries only catch render-tree errors. They don't see
// uncaught throws from event handlers, async tasks, setTimeouts, or
// rejected promises. We install global window listeners that forward such
// errors to the Rust side, where `record_frontend_error` writes a
// `<timestamp>.frontend.txt` next to the panic / crash files so a single
// logs directory contains the full incident timeline.
//
// `installCrashHandlers` is idempotent - call once near the top of
// main.tsx (before QueryClientProvider) and subsequent calls are no-ops.

import { commands } from "@/bindings";

let installed = false;

export function installCrashHandlers(): void {
  if (installed) return;
  installed = true;

  window.addEventListener("error", (e: ErrorEvent) => {
    // Best-effort: swallow any failure to record so we don't compound the
    // original problem. (E.g. tauri IPC unavailable in a non-Tauri env.)
    void commands
      .recordFrontendError({
        message: e.message ?? "<no message>",
        source: e.filename ?? null,
        line: e.lineno ?? null,
        column: e.colno ?? null,
        stack: e.error instanceof Error ? (e.error.stack ?? null) : null,
        kind: "error",
      })
      .catch(() => {});
  });

  window.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
    const reason =
      e.reason instanceof Error ? e.reason : new Error(String(e.reason));
    void commands
      .recordFrontendError({
        message: reason.message,
        source: null,
        line: null,
        column: null,
        stack: reason.stack ?? null,
        kind: "unhandledrejection",
      })
      .catch(() => {});
  });
}
