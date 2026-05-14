// Phase 17 Task 86 — per-route error boundary.
//
// Wraps each route's component so an exception in a tool or workspace
// view doesn't blow up the whole app. The fallback surface offers
// Retry (reset the boundary) and Copy details (stack to clipboard for
// bug reports).  Delta P's crash logger captures the raw error via
// window.onerror; the boundary is the user-facing slice of that path.
import { ErrorBoundary, type FallbackProps } from "react-error-boundary";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

function Fallback({ error, resetErrorBoundary }: FallbackProps) {
  const { t } = useTranslation("errors");
  // react-error-boundary 5.x narrowed `error` to `unknown`; normalise to Error
  // for message/stack access without losing the original throw value.
  const err = error instanceof Error ? error : new Error(String(error));
  return (
    <div
      role="alert"
      className="rounded border border-red-200 bg-red-50 p-4 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100"
    >
      <h2 className="font-semibold">{t("boundary_title")}</h2>
      <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-xs">
        {err.message}
      </pre>
      <div className="mt-3 flex gap-2">
        <Button onClick={resetErrorBoundary} variant="outline" size="sm">
          {t("boundary_retry")}
        </Button>
        <Button
          onClick={() => {
            const detail = err.stack ?? err.message;
            void navigator.clipboard?.writeText(detail);
          }}
          size="sm"
        >
          {t("boundary_copy")}
        </Button>
      </div>
    </div>
  );
}

export function AppErrorBoundary({ children }: { children: ReactNode }) {
  return <ErrorBoundary FallbackComponent={Fallback}>{children}</ErrorBoundary>;
}
