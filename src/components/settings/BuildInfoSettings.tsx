import { useEffect, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Button } from "@/components/ui/button";
import {
  commands,
  type BuildInfo,
  type UpdateCheck,
  type UpdateInstall,
  type UpdateInstallStatus,
} from "@/bindings";
import { useUpdateStore } from "@/stores/updateStore";
import { useCloseGuard, type CloseGuardRequest } from "@/stores/closeGuardStore";
import { unsavedDocIds } from "@/lib/unsavedWork";

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

type SettingsT = TFunction<"settings">;

/** One literal key per status, so the i18n check sees every key. */
const INSTALL_TEXT: Record<UpdateInstallStatus, (t: SettingsT, reason: string) => string> = {
  ready: (t) => t("update_install.ready"),
  started: (t) => t("update_install.started"),
  disabled: (t) => t("update_install.disabled"),
  release_changed: (t) => t("update_install.release_changed"),
  no_setup: (t, reason) => t("update_install.no_setup", { reason }),
  too_large: (t, reason) => t("update_install.too_large", { reason }),
  blocked_host: (t, reason) => t("update_install.blocked_host", { reason }),
  download_failed: (t, reason) => t("update_install.download_failed", { reason }),
  checksum_missing: (t) => t("update_install.checksum_missing"),
  checksum_mismatch: (t) => t("update_install.checksum_mismatch"),
  disk_error: (t, reason) => t("update_install.disk_error", { reason }),
  file_changed: (t) => t("update_install.file_changed"),
  start_failed: (t, reason) => t("update_install.start_failed", { reason }),
};

function installText(t: SettingsT, result: UpdateInstall) {
  return INSTALL_TEXT[result.status](t, result.detail ?? "");
}

/** Runs `action` at once when no document has unsaved work; otherwise the
 * unsaved-changes dialog asks first (Save, Discard or Cancel). */
function whenWorkIsSafe(open: (request: CloseGuardRequest) => void, action: () => void) {
  const docIds = unsavedDocIds();
  if (docIds.length === 0) action();
  else open({ kind: "update", docIds, onClosed: action });
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

function InstallStatus() {
  const { t } = useTranslation("settings");
  const phase = useUpdateStore((state) => state.installPhase);
  const result = useUpdateStore((state) => state.installResult);
  if (phase === "downloading") return <p className="text-sm">{t("update_install.downloading")}</p>;
  if (!result) return null;
  const failed = result.status !== "ready" && result.status !== "started";
  return (
    <p
      role={failed ? "alert" : undefined}
      className={`text-sm text-pretty ${failed ? "text-[var(--color-danger)]" : ""}`}
    >
      {installText(t, result)}
    </p>
  );
}

function UpdateButton() {
  const { t } = useTranslation("settings");
  const result = useUpdateStore((state) => state.result);
  const phase = useUpdateStore((state) => state.installPhase);
  const downloadUpdate = useUpdateStore((state) => state.downloadUpdate);
  const startUpdate = useUpdateStore((state) => state.startUpdate);
  const openGuard = useCloseGuard((state) => state.open);
  if (result?.status !== "available") return null;

  // Ask about unsaved work before the download and again before the start:
  // the setup closes PDF Editor.
  const update = () =>
    whenWorkIsSafe(openGuard, () => {
      void downloadUpdate().then((ready) => {
        if (ready) whenWorkIsSafe(openGuard, () => void startUpdate());
      });
    });

  return (
    <div className="space-y-1">
      <Button disabled={phase !== "idle"} onClick={update}>
        <Download className="mr-2 h-4 w-4" aria-hidden="true" />
        {t("update_install.button", { version: result.latest_version })}
      </Button>
      <p className="text-sm text-pretty text-[var(--color-muted)]">
        {t("update_install.help", { version: result.latest_version })}
      </p>
    </div>
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
      <UpdateButton />
      <InstallStatus />
    </section>
  );
}
