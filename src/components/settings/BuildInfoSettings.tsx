import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useUpdateStore } from "@/stores/updateStore";

function shortCommit(commit: string | null | undefined) {
  if (!commit || commit === "unknown") return null;
  return commit.slice(0, 8);
}

export function BuildInfoSettings() {
  const { t } = useTranslation("settings");
  const result = useUpdateStore((state) => state.result);
  const checking = useUpdateStore((state) => state.checking);
  const checkedAt = useUpdateStore((state) => state.checkedAt);
  const check = useUpdateStore((state) => state.check);

  const embeddedCommit = shortCommit(result?.embedded_commit);
  const repoHead = shortCommit(result?.repo_head);
  const lastCheck = checking
    ? t("checking")
    : !checkedAt
      ? t("not_checked")
      : result?.error
        ? t("check_unavailable", { reason: result.error })
        : result?.behind
          ? t("update_available")
          : t("up_to_date");

  return (
    <section aria-labelledby="build-info-heading" className="space-y-4 border-t pt-6">
      <div>
        <h2 id="build-info-heading" className="text-lg font-semibold text-balance">
          {t("about")}
        </h2>
        <p className="mt-1 text-sm text-pretty text-[var(--color-muted)]">
          {t("about_description")}
        </p>
      </div>

      <dl className="grid grid-cols-[minmax(9rem,auto)_1fr] gap-x-6 gap-y-3 text-sm">
        <dt className="text-[var(--color-muted)]">{t("embedded_commit")}</dt>
        <dd className="font-mono tabular-nums">{embeddedCommit ?? t("unknown")}</dd>

        <dt className="text-[var(--color-muted)]">{t("build_state")}</dt>
        <dd>{result?.embedded_dirty ? t("dirty") : t("clean")}</dd>

        <dt className="text-[var(--color-muted)]">{t("repo_head")}</dt>
        <dd className="font-mono tabular-nums">{repoHead ?? t("unknown")}</dd>

        <dt className="text-[var(--color-muted)]">{t("working_tree")}</dt>
        <dd>{result ? (result.dirty ? t("dirty") : t("clean")) : t("unknown")}</dd>

        <dt className="text-[var(--color-muted)]">{t("last_check")}</dt>
        <dd className="min-w-0 break-words">{lastCheck}</dd>
      </dl>

      <Button variant="outline" disabled={checking} onClick={() => void check(true)}>
        <RefreshCw
          className={`mr-2 h-4 w-4 ${checking ? "animate-spin" : ""}`}
          aria-hidden="true"
        />
        {checking ? t("checking") : t("check_now")}
      </Button>
    </section>
  );
}
