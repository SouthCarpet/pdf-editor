import { create } from "zustand";
import { invokeCommand } from "@/tauri/bridge";

export interface RecentFile {
  path: string;
  display_name: string;
  last_opened_at: string;
  page_count?: number;
  size_bytes?: number;
}

interface RecentState {
  files: RecentFile[];
  loading: boolean;
  refresh: () => Promise<void>;
  remove: (path: string) => Promise<void>;
}

export const useRecentFiles = create<RecentState>((set) => ({
  files: [],
  loading: false,
  refresh: async () => {
    set({ loading: true });
    const files = await invokeCommand<RecentFile[]>("recent_files_list", {
      limit: 20,
    });
    set({ files, loading: false });
  },
  remove: async (path) => {
    await invokeCommand("recent_files_remove", { path });
    set((s) => ({ files: s.files.filter((f) => f.path !== path) }));
  },
}));
