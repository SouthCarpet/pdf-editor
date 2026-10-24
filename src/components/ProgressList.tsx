import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { useJobsStore, type JobStatus } from "@/stores/jobsStore";

// State is a mark shape plus a word, never colour alone (R28): half square
// running, full square done, square with a danger centre failed, empty square
// cancelled. A running job shows a determinate k-progress bar, not a spinner.
const MARK_CLASS = {
  pending: "k-mark",
  running: "k-mark k-mark--half",
  done: "k-mark k-mark--full",
  error: "k-mark k-mark--error",
  cancelled: "k-mark",
} as const;

// Renders every job in the jobs store as a ruled status row. Rows are
// stable-ordered by the underlying Map insertion order. Tool routes typically
// place a single <ProgressList /> below their FileDropzone so the user sees
// in-flight + recent runs.
export function ProgressList() {
  const { t } = useTranslation();
  // Select the stable Map snapshot. Returning Array.from(...) from the
  // selector creates a fresh snapshot for every useSyncExternalStore read,
  // which React 19 retries until it hits maximum update depth.
  const jobsById = useJobsStore((s) => s.jobs);
  const jobs = Array.from(jobsById.values());
  if (jobs.length === 0) return null;
  const statusLabel: Record<JobStatus, string> = {
    pending: t("tools:progress.pending"),
    running: t("tools:progress.running"),
    done: t("tools:progress.done"),
    error: t("tools:progress.error"),
    cancelled: t("tools:progress.cancelled"),
  };

  return (
    <ul aria-live="polite" aria-label="Job progress" className="border-t border-[var(--color-border)]">
      {jobs.map((j) => (
        <li key={j.id} className="flex items-start gap-3 border-b border-[var(--color-border)] py-3">
          <span className={`${MARK_CLASS[j.status]} mt-1.5`} aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate font-semibold">{j.toolId}</span>
              <span className="k-caption shrink-0">{statusLabel[j.status]}</span>
            </div>
            <div className="k-caption truncate">{j.label ?? j.inputPaths.join(", ")}</div>
            {j.status === "running" && (
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(j.progress * 100)}
                aria-label={`${j.toolId} progress`}
                className="k-progress mt-2"
              >
                <span
                  className="k-progress-fill"
                  style={{ "--k-value": j.progress } as CSSProperties}
                />
              </div>
            )}
            {j.status === "error" && j.error && (
              <div className="mt-1 text-sm">{t(`errors:${j.error.key}`, { ...j.error })}</div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
