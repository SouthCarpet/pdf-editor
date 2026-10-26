import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function RecoveryWarningModal({ open, onConfirm, onCancel }: Props) {
  const { t } = useTranslation(["recovery", "common"]);
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) onCancel();
      }}
    >
      <DialogContent
        closeLabel={t("common:cancel")}
        className="k-dialog rounded-[var(--radius-sm)] border-[var(--color-border)] bg-[var(--color-surface-raised)] text-[var(--color-text)] shadow-none sm:rounded-[var(--radius-sm)]"
      >
        <DialogTitle className="k-dialog-title pr-8 text-[length:var(--text-xl)]">
          {t("recovery:warning_title")}
        </DialogTitle>
        <DialogDescription className="k-dialog-body text-[var(--color-text-muted)]">
          {t("recovery:warning_body")}
        </DialogDescription>
        <p className="k-state-label text-[var(--color-text-muted)]">
          <span className="k-mark k-mark--half" aria-hidden="true" />
          {t("recovery:warning_aes")}
        </p>
        <div className="k-dialog-actions">
          <Button variant="ghost" onClick={onCancel}>
            {t("common:cancel")}
          </Button>
          <Button onClick={onConfirm}>{t("recovery:warning_accept")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
