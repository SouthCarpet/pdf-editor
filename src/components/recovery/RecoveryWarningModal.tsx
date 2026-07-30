// Phase 16 Task 82 — Recovery warning modal + legal disclaimer.
//
// Gates the Recovery wizard behind an explicit acknowledgement that the
// user understands they should only recover PDFs they own. AES-256 caveat
// is also surfaced because the runtime cost difference between V<=4 and
// V=5 is enormous and users routinely don't realize.
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function RecoveryWarningModal({ open, onConfirm, onCancel }: Props) {
  const { t } = useTranslation("common");
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-overlay-soft)]">
      <div className="w-[28rem] rounded-lg border border-[var(--color-warning)] bg-[var(--color-card)] p-6 text-[var(--color-foreground)] shadow-xl">
        <h2 className="text-lg font-semibold text-[var(--color-warning)]">
          Password recovery
        </h2>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Use this feature only on PDFs you legally own. You are responsible
          for compliance with your local laws (e.g. EU InfoSoc Directive,
          US DMCA section 1201). Recovery on third-party documents may be
          illegal.
        </p>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          For AES-256 encrypted PDFs (PDF 2.0), brute-force can take years.
          Use Dictionary mode first.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            {t("cancel")}
          </Button>
          <Button onClick={onConfirm} variant="destructive">
            I understand, continue
          </Button>
        </div>
      </div>
    </div>
  );
}
