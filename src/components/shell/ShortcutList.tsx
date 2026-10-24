import { useTranslation } from "react-i18next";
import { WORKSPACE_SHORTCUTS, type ShortcutGroup } from "@/components/workspace/shortcuts";
import {
  formatKeys,
  SHORTCUT_GROUP_ORDER,
  shortcutTranslationKey,
} from "@/components/workspace/shortcutDisplay";

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

/** The shortcut sheet as plain text for the help panel: the two app keys
 * first, then the workspace groups, all from the one binding table. */
export function ShortcutList() {
  const { t } = useTranslation(["workspace", "common"]);
  return (
    <div className="space-y-4">
      <p>{t("common:shell.help.app_keys")}</p>
      {SHORTCUT_GROUP_ORDER.map((group) => (
        <section key={group} aria-label={groupTitle(t, group)}>
          <h3 className="mb-1 font-semibold text-[var(--color-text)]">{groupTitle(t, group)}</h3>
          <dl>
            {WORKSPACE_SHORTCUTS.filter((row) => row.group === group).map((row) => (
              <div key={row.id} className="flex justify-between gap-4 py-1">
                <dt>{t(shortcutTranslationKey(row))}</dt>
                <dd className="k-num shrink-0 text-[var(--color-text)]">{formatKeys(row).join(" ")}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
