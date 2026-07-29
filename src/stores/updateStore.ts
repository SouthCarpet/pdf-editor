import { create } from "zustand";
import { commands, type VersionCheck } from "@/bindings";

type UpdateState = {
  result: VersionCheck | null;
  checking: boolean;
  checkedAt: number | null;
  dismissed: boolean;
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
    await commands.launchUpdate();
  },
}));
