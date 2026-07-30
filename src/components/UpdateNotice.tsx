import { AlertTriangle, Download, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useUpdateStore } from "@/stores/updateStore";

export function UpdateNotice() {
  const { t } = useTranslation("common");
  const result = useUpdateStore((state) => state.result);
  const dismissed = useUpdateStore((state) => state.dismissed);
  const launching = useUpdateStore((state) => state.launching);
  const launchError = useUpdateStore((state) => state.launchError);
  const dismiss = useUpdateStore((state) => state.dismiss);
  const launch = useUpdateStore((state) => state.launch);

  if (dismissed || (!result?.behind && !result?.error && !launchError)) return null;

  const unavailable = Boolean(result?.error);

  return (
    <div
      className="update-notice-enter flex min-h-11 shrink-0 items-center gap-3 border-b border-[var(--color-warning)] bg-[var(--color-warning-soft)] px-4 py-2 text-[var(--color-warning-soft-foreground)]"
      role="status"
    >
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-sm text-pretty">
        {launchError
          ? t("update.launch_failed", { reason: launchError })
          : unavailable
            ? t("update.check_unavailable", { reason: result?.error })
            : t("update.available")}
      </p>
      {!unavailable && !launchError && (
        <Button
          disabled={launching}
          className="gap-2 bg-[var(--color-warning)] text-[var(--color-warning-foreground)] hover:bg-[var(--color-warning-hover)]"
          onClick={() => void launch()}
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          {launching ? t("update.starting") : t("update.action")}
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="shrink-0 hover:bg-[var(--color-warning-soft)]"
        aria-label={t("update.dismiss")}
        onClick={dismiss}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  );
}
