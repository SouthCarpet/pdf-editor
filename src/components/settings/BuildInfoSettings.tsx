import { useEffect, useState } from "react";
import { CircleAlert, Download } from "lucide-react";
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
import { SettingSwitch } from "./SettingSwitch";

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

/** "Checked 24. 10. 2026 19:56" in the UI language; empty before the first check. */
function useCheckedAtText() {
  const { t, i18n } = useTranslation("settings");
  const checkedAt = useUpdateStore((state) => state.checkedAt);
  if (checkedAt === null) return null;
  const time = new Intl.DateTimeFormat(i18n.resolvedLanguage, {
    dateStyle: "short",
    timeStyle: "short",
  }).format(checkedAt);
  return t("checked_at", { time });
}

function BuildDetails({ build }: { build: BuildInfo | null }) {
  const { t } = useTranslation(["settings", "common"]);
  const lastCheck = useLastCheckText();
  const checkedAt = useCheckedAtText();
  const commit = shortCommit(build?.commit);
  return (
    <dl className="k-summary">
      <div className="k-summary-row">
        <dt>{t("settings:about_name")}</dt>
        <dd>
          <span className="k-summary-value">{t("common:app_name")}</span>
        </dd>
      </div>
      <div className="k-summary-row">
        <dt>{t("settings:version")}</dt>
        <dd>
          <span className="k-summary-value k-num">{build?.version ?? t("settings:unknown")}</span>
        </dd>
      </div>
      <div className="k-summary-row">
        <dt>{t("settings:commit")}</dt>
        <dd className="k-num">
          {commit ?? t("settings:unknown")} {build?.dirty ? `(${t("settings:dirty")})` : ""}
        </dd>
      </div>
      <div className="k-summary-row">
        <dt>{t("settings:last_check")}</dt>
        <dd className="min-w-0 break-words" data-testid="update-status">
          {lastCheck}
          {checkedAt && <span className="k-summary-note"> {checkedAt}</span>}
        </dd>
      </div>
      <div className="k-summary-row">
        <dt>{t("settings:licences")}</dt>
        <dd>
          <ul className="space-y-1 text-sm text-pretty">
            <li>{t("settings:licences_app")}</li>
            <li>{t("settings:licences_font")}</li>
            <li>{t("settings:licences_ocr")}</li>
          </ul>
        </dd>
      </div>
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
      <SettingSwitch
        checked={enabled === true}
        disabled={enabled === null || savingConsent}
        onChange={(on) => void setEnabled(on)}
      >
        {t("update_check_consent")}
      </SettingSwitch>
      <p className="k-caption text-pretty">{t("update_check_consent_help")}</p>
      {consentError && (
        <p role="alert" className="k-field-error">
          {t("update_check_save_failed", { reason: consentError })}
        </p>
      )}
    </div>
  );
}

/** No spinner: the label changes while the check runs and the button waits. */
function CheckNowButton() {
  const { t } = useTranslation("settings");
  const enabled = useUpdateStore((state) => state.enabled);
  const checking = useUpdateStore((state) => state.checking);
  const check = useUpdateStore((state) => state.check);
  return (
    <Button
      variant="outline"
      disabled={checking || enabled !== true}
      aria-busy={checking}
      onClick={() => void check("manual")}
    >
      {checking ? t("checking") : t("check_now")}
    </Button>
  );
}

function OpenLogsButton() {
  const { t } = useTranslation("settings");
  // Delta P: shells out to explorer.exe via the open_logs_folder Tauri
  // command. We don't surface errors visually - the only way it can fail
  // is if logs_dir() can't resolve %AppData% (unlikely on Windows) or
  // spawning explorer is denied; both already produce a frontend error
  // event captured by installCrashHandlers().
  const handleOpenLogs = () => {
    void commands.openLogsFolder().catch((e) => {
      console.error("open_logs_folder failed", e);
    });
  };
  return (
    <Button variant="outline" onClick={handleOpenLogs}>
      {t("open_logs")}
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
  if (!failed) return <p className="text-sm text-pretty">{installText(t, result)}</p>;
  return (
    <div role="alert" className="k-alert k-alert--error">
      <CircleAlert className="k-alert-icon h-4 w-4" aria-hidden="true" />
      <p className="k-alert-body text-pretty">{installText(t, result)}</p>
    </div>
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
      <p className="k-caption text-pretty">
        {t("update_install.help", { version: result.latest_version })}
      </p>
    </div>
  );
}

/** Updates, then About as the last section of Settings. */
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
    <>
      <section className="k-settings-section" aria-labelledby="updates-heading">
        <h3 id="updates-heading">{t("section_updates")}</h3>
        <UpdateConsent />
        <UpdateButton />
        <InstallStatus />
      </section>
      <section className="k-settings-section" aria-labelledby="build-info-heading">
        <div>
          <h3 id="build-info-heading">{t("about")}</h3>
          <p className="k-caption text-pretty">{t("about_description")}</p>
        </div>
        <BuildDetails build={build} />
        <div className="flex flex-wrap gap-2">
          <CheckNowButton />
          <OpenLogsButton />
        </div>
      </section>
    </>
  );
}