import { create } from "zustand";
import { commands, type UpdateCheck, type UpdateInstall } from "@/bindings";

/** Where a check comes from. A start check stays silent: it only marks a
 * found update with a dot on the Settings button. */
export type CheckTrigger = "start" | "about" | "manual";

/** The Update button: idle, downloading and checking the setup, or
 * starting it (the app exits right after a successful start). */
export type InstallPhase = "idle" | "downloading" | "starting";

type UpdateState = {
  /** Stored consent; null until loaded from the backend. */
  enabled: boolean | null;
  consentError: string | null;
  savingConsent: boolean;
  result: UpdateCheck | null;
  checking: boolean;
  checkedAt: number | null;
  /** A start check found a newer release; shown as a dot, never a dialog. */
  updateFlag: boolean;
  /** React StrictMode runs the start effect twice in development; one
   * start check per app run is the contract. */
  startRequested: boolean;
  installPhase: InstallPhase;
  /** The last download or start answer; null before the first click. */
  installResult: UpdateInstall | null;
  loadConsent: () => Promise<boolean>;
  setEnabled: (enabled: boolean) => Promise<void>;
  check: (trigger: CheckTrigger) => Promise<void>;
  /** Downloads and verifies the setup of the release the check found.
   * Resolves true when the setup is ready to start. */
  downloadUpdate: () => Promise<boolean>;
  /** Starts the verified setup; the backend exits the app after that. */
  startUpdate: () => Promise<void>;
};

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function installFailure(error: unknown): UpdateInstall {
  return { status: "start_failed", version: null, detail: errorText(error) };
}

/** A backend AppError is `{ key, data: { detail } }`; show the detail. */
function appErrorText(error: { key: string; data: unknown } | string) {
  if (typeof error === "string") return error;
  const detail = (error.data as { detail?: unknown } | null)?.detail;
  return typeof detail === "string" ? detail : error.key;
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  enabled: null,
  consentError: null,
  savingConsent: false,
  result: null,
  checking: false,
  checkedAt: null,
  updateFlag: false,
  startRequested: false,
  installPhase: "idle",
  installResult: null,
  loadConsent: async () => {
    const result = await commands.getUpdateCheckEnabled().catch(() => null);
    const enabled = result?.status === "ok" && result.data;
    set({ enabled });
    return enabled;
  },
  setEnabled: async (enabled) => {
    set({ savingConsent: true, consentError: null });
    const result = await commands.setUpdateCheckEnabled(enabled).catch((error: unknown) => ({
      status: "error" as const,
      error: errorText(error),
    }));
    if (result.status === "error") {
      set({ savingConsent: false, consentError: appErrorText(result.error) });
      return;
    }
    set({ savingConsent: false, enabled });
    if (enabled) await get().check("manual");
  },
  check: async (trigger) => {
    if (get().checking) return;
    if (trigger === "start") {
      if (get().startRequested) return;
      set({ startRequested: true });
    }
    const enabled = get().enabled ?? (await get().loadConsent());
    if (!enabled) return;
    set({ checking: true });
    const result: UpdateCheck = await commands.checkForUpdate().catch((error: unknown) => ({
      status: "connection_error" as const,
      current_version: "",
      latest_version: null,
      tag: null,
      release_url: null,
      detail: errorText(error),
    }));
    if (trigger === "start") {
      // Silent: no status line, no error, only the dot when an update exists.
      set({ checking: false, updateFlag: result.status === "available" });
      return;
    }
    set({
      checking: false,
      result,
      checkedAt: Date.now(),
      updateFlag: result.status === "available",
    });
  },
  downloadUpdate: async () => {
    const tag = get().result?.tag;
    if (!tag || get().installPhase !== "idle") return false;
    set({ installPhase: "downloading", installResult: null });
    const result = await commands.downloadUpdate(tag).catch(installFailure);
    set({ installPhase: "idle", installResult: result });
    return result.status === "ready";
  },
  startUpdate: async () => {
    if (get().installPhase !== "idle") return;
    set({ installPhase: "starting" });
    const result = await commands.installUpdate().catch(installFailure);
    set({ installPhase: result.status === "started" ? "starting" : "idle", installResult: result });
  },
}));
