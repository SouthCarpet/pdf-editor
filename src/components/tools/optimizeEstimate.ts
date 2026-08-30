export interface OptimizeEstimate {
  current_bytes: number;
  estimated_bytes: number;
  method: "dry_run" | "heuristic";
  details: string[];
}

export function formatBytes(bytes: number): string {
  if (bytes < 1_000) return `${Math.max(0, Math.round(bytes))} B`;
  const value = bytes < 1_000_000 ? bytes / 1_000 : bytes / 1_000_000;
  const unit = bytes < 1_000_000 ? "kB" : "MB";
  return `${new Intl.NumberFormat("sk-SK", { maximumFractionDigits: 1 }).format(value)} ${unit}`;
}

export function scheduleEstimate(task: () => void, delayMs = 400): () => void {
  const timeout = window.setTimeout(task, delayMs);
  return () => window.clearTimeout(timeout);
}

export function estimatePercent(result: OptimizeEstimate): number {
  if (result.current_bytes === 0) return 0;
  return Math.round(
    ((result.estimated_bytes - result.current_bytes) / result.current_bytes) * 100,
  );
}
