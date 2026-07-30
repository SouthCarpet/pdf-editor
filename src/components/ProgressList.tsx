import { useTranslation } from "react-i18next";
import { CheckCircle2, Loader2, X, XCircle } from "lucide-react";
import { useJobsStore } from "@/stores/jobsStore";

// Renders every job in the jobs store as a status row: running (spinner +
// progress bar), done (green check), error (red X + translated error key),
// cancelled (grey X). Rows are stable-ordered by the underlying Map insertion
// order. Tool routes typically place a single <ProgressList /> below their
// FileDropzone so the user sees in-flight + recent runs.
export function ProgressList() {
  const { t } = useTranslation();
  const jobs = useJobsStore((s) => Array.from(s.jobs.values()));
  if (jobs.length === 0) return null;

  return (
    <ul
      aria-live="polite"
      aria-label="Job progress"
      className="divide-y divide-[var(--color-border)] rounded border border-[var(--color-border)]"
    >
      {jobs.map((j) => (
        <li key={j.id} className="flex items-center gap-3 p-3">
          {j.status === "running" && <Loader2 className="h-4 w-4 animate-spin" />}
          {j.status === "done" && (
            <CheckCircle2 className="h-4 w-4 text-[var(--color-success-text)]" />
          )}
          {j.status === "error" && <XCircle className="h-4 w-4 text-[var(--color-danger-text)]" />}
          {j.status === "cancelled" && (
            <X className="h-4 w-4 text-[var(--color-muted)]" />
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{j.toolId}</div>
            <div className="truncate text-xs text-[var(--color-muted)]">
              {j.label ?? j.inputPaths.join(", ")}
            </div>
            {j.status === "running" && (
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(j.progress * 100)}
                aria-label={`${j.toolId} progress`}
                className="mt-1 h-1 w-full overflow-hidden rounded bg-[var(--color-control-active)]"
              >
                <div
                  className="h-full bg-[var(--color-muted)]"
                  style={{ width: `${(j.progress * 100).toFixed(0)}%` }}
                />
              </div>
            )}
            {j.status === "error" && j.error && (
              <div className="mt-1 text-xs text-[var(--color-danger-text)]">
                {t(`errors:${j.error.key}`, { ...j.error })}
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
