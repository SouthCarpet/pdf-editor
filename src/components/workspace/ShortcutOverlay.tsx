import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  WORKSPACE_SHORTCUTS,
  type ShortcutGroup,
} from "./shortcuts";
import {
  formatKeys,
  SHORTCUT_GROUP_ORDER,
  shortcutTranslationKey,
} from "./shortcutDisplay";

function groupTitle(t: ReturnType<typeof useTranslation>["t"], group: ShortcutGroup): string {
  switch (group) {
    case "navigation":
      return t("workspace:shortcuts.groups.navigation");
    case "forms":
      return t("workspace:shortcuts.groups.forms");
    case "edit":
      return t("workspace:shortcuts.groups.edit");
    case "view":
      return t("workspace:shortcuts.groups.view");
    case "file":
      return t("workspace:shortcuts.groups.file");
  }
}

interface ShortcutOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShortcutOverlay({ open, onOpenChange }: ShortcutOverlayProps) {
  const { t } = useTranslation(["workspace", "common"]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeLabel={t("common:close")}
        className="max-h-[85vh] max-w-3xl overflow-y-auto rounded-lg"
      >
        <DialogHeader>
          <DialogTitle className="text-balance">{t("workspace:shortcuts.title")}</DialogTitle>
          <DialogDescription className="text-pretty">
            {t("workspace:shortcuts.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
          {SHORTCUT_GROUP_ORDER.map((group) => {
            const rows = WORKSPACE_SHORTCUTS.filter((row) => row.group === group);
            return (
              <section key={group} aria-labelledby={`shortcut-group-${group}`}>
                <h3
                  id={`shortcut-group-${group}`}
                  className="mb-2 text-sm font-semibold text-[var(--color-foreground)]"
                >
                  {groupTitle(t, group)}
                </h3>
                <div className="divide-y divide-[var(--color-border)]">
                  {rows.map((row) => (
                    <div
                      key={row.id}
                      data-shortcut-id={row.id}
                      className="flex min-h-10 items-center justify-between gap-4 py-2 text-sm"
                    >
                      <span className="text-pretty text-[var(--color-foreground)]">
                        {t(shortcutTranslationKey(row))}
                      </span>
                      <span className="flex shrink-0 items-center gap-1" aria-hidden="true">
                        {formatKeys(row).map((token, index) =>
                          token === "+" || token === "/" ? (
                            <span key={`${token}-${index}`} className="text-xs text-[var(--color-muted)]">
                              {token}
                            </span>
                          ) : (
                            <kbd
                              key={`${token}-${index}`}
                              className="min-w-6 rounded-sm border border-[var(--color-border)] bg-[var(--color-control)] px-1.5 py-0.5 text-center text-xs font-medium text-[var(--color-foreground)]"
                            >
                              {token}
                            </kbd>
                          ),
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
