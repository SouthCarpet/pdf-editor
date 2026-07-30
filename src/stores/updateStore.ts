import { create } from "zustand";
import { commands, type VersionCheck } from "@/bindings";

type UpdateState = {
  result: VersionCheck | null;
  checking: boolean;
  checkedAt: number | null;
  dismissed: boolean;
  launching: boolean;
  launchError: string | null;
  check: (force?: boolean) => Promise<void>;
  dismiss: () => void;
  launch: () => Promise<void>;
};

let startupCheckStarted = false;

export const useUpdateStore = create<UpdateState>((set, get) => ({
  result: null,
  checking: false,
  checkedAt: null,
  dismissed: false,
  launching: false,
  launchError: null,
  check: async (force = false) => {
    if (get().checking || (!force && startupCheckStarted)) return;
    startupCheckStarted = true;
    set({ checking: true });

    try {
      const result = await commands.checkForUpdate();
      set({ result, checkedAt: Date.now(), checking: false });
    } catch (error) {
      set({
        result: {
          embedded_commit: "unknown",
          embedded_dirty: false,
          repo_head: null,
          dirty: false,
          behind: false,
          error: error instanceof Error ? error.message : String(error),
        },
        checkedAt: Date.now(),
        checking: false,
      });
    }
  },
  dismiss: () => set({ dismissed: true }),
  launch: async () => {
    set({ launching: true, launchError: null });
    try {
      const result = await commands.launchUpdate();
      if (result.status === "error") {
        set({ launching: false, launchError: String(result.error), dismissed: false });
      }
    } catch (error) {
      set({
        launching: false,
        launchError: error instanceof Error ? error.message : String(error),
        dismissed: false,
      });
    }
  },
}));
