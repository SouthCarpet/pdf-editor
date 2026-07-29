import { AlertTriangle, Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUpdateStore } from "@/stores/updateStore";

export function UpdateNotice() {
  const result = useUpdateStore((state) => state.result);
  const dismissed = useUpdateStore((state) => state.dismissed);
  const dismiss = useUpdateStore((state) => state.dismiss);
  const launch = useUpdateStore((state) => state.launch);

  if (dismissed || (!result?.behind && !result?.error)) return null;

  const unavailable = Boolean(result.error);

  return (
    <div
      className="update-notice-enter flex min-h-11 shrink-0 items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"
      role="status"
    >
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-sm">
        {unavailable
          ? `Update check unavailable: ${result.error}`
          : "A newer local build is available."}
      </p>
      {!unavailable && (
        <Button
          size="sm"
          className="gap-2 bg-amber-950 text-amber-50 hover:bg-amber-900 dark:bg-amber-100 dark:text-amber-950 dark:hover:bg-amber-200"
          onClick={() => void launch()}
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          Update
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 hover:bg-amber-100 dark:hover:bg-amber-900"
        aria-label="Dismiss update notice"
        onClick={dismiss}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
