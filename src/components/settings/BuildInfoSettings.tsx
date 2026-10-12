import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Button } from "@/components/ui/button";
import { commands, type BuildInfo, type UpdateCheck } from "@/bindings";
import { useUpdateStore } from "@/stores/updateStore";

function shortCommit(commit: string | undefined) {
  if (!commit || commit === "unknown") return null;
  return commit.slice(0, 8);
}

function statusText(t: TFunction<"settings">, result: UpdateCheck) {
  switch (result.status) {
    case "disabled":
      return t("update_checks_off");
    case "up_to_date":
      return t("up_to_date", { version: result.latest_version ?? result.current_version });
    case "available":
      return t("update_available", { version: result.latest_version });
    case "connection_error":
      return t("check_connection_error", { reason: result.detail });
    case "response_error":
      return t("check_response_error", { reason: result.detail });
  }
}

function useLastCheckText() {
  const { t } = useTranslation("settings");
  const enabled = useUpdateStore((state) => state.enabled);
  const checking = useUpdateStore((state) => state.checking);
  const result = useUpdateStore((state) => state.result);
  if (checking) return t("checking");
  if (enabled === false) return t("update_checks_off");
  if (!result) return t("not_checked");
  return statusText(t, result);
}

function BuildDetails({ build }: { build: BuildInfo | null }) {
  const { t } = useTranslation("settings");
  const lastCheck = useLastCheckText();
  const commit = shortCommit(build?.commit);
  return (
    <dl className="grid grid-cols-[minmax(9rem,auto)_1fr] gap-x-6 gap-y-3 text-sm">
      <dt className="text-[var(--color-muted)]">{t("version")}</dt>
      <dd className="font-mono tabular-nums">{build?.version ?? t("unknown")}</dd>

      <dt className="text-[var(--color-muted)]">{t("commit")}</dt>
      <dd className="font-mono tabular-nums">
        {commit ?? t("unknown")} {build?.dirty ? `(${t("dirty")})` : ""}
      </dd>

      <dt className="text-[var(--color-muted)]">{t("last_check")}</dt>
      <dd className="min-w-0 break-words" data-testid="update-status">
        {lastCheck}
      </dd>
    </dl>
  );
}

function UpdateConsent() {
  const { t } = useTranslation("settings");
  const enabled = useUpdateStore((state) => state.enabled);
  const savingConsent = useUpdateStore((state) => state.savingConsent);
  const consentError = useUpdateStore((state) => state.consentError);
  const setEnabled = useUpdateStore((state) => state.setEnabled);
  return (
    <div className="space-y-1">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={enabled === true}
          disabled={enabled === null || savingConsent}
          onChange={(e) => void setEnabled(e.target.checked)}
        />
        {t("update_check_consent")}
      </label>
      <p className="text-sm text-pretty text-[var(--color-muted)]">
        {t("update_check_consent_help")}
      </p>
      {consentError && (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {t("update_check_save_failed", { reason: consentError })}
        </p>
      )}
    </div>
  );
}

function CheckNowButton() {
  const { t } = useTranslation("settings");
  const enabled = useUpdateStore((state) => state.enabled);
  const checking = useUpdateStore((state) => state.checking);
  const check = useUpdateStore((state) => state.check);
  return (
    <Button
      variant="outline"
      disabled={checking || enabled !== true}
      onClick={() => void check("manual")}
    >
      <RefreshCw
        className={`mr-2 h-4 w-4 ${checking ? "animate-spin" : ""}`}
        aria-hidden="true"
      />
      {checking ? t("checking") : t("check_now")}
    </Button>
  );
}

export function BuildInfoSettings() {
  const { t } = useTranslation("settings");
  const [build, setBuild] = useState<BuildInfo | null>(null);
  const check = useUpdateStore((state) => state.check);

  useEffect(() => {
    void commands.buildInfo().then(setBuild);
    // Opening About checks once, only when the stored consent is on.
    void check("about");
  }, [check]);

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
      <BuildDetails build={build} />
      <UpdateConsent />
      <CheckNowButton />
    </section>
  );
}
