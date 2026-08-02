// Phase 15 Task 79 - projects zustand store.
//
// Thin frontend cache for the project list + per-project files / pipelines.
// We hit the backend via the generated commands every time the user opens a
// detail page (small N, low refresh cost), but the list is cached so the
// dashboard tile and the list page don't re-query on every mount.
import { create } from "zustand";
import { commands, type Project } from "@/bindings";

interface ProjectsState {
  projects: Project[];
  loading: boolean;
  refresh: () => Promise<void>;
  create: (name: string, description: string | null) => Promise<number | null>;
  remove: (id: number) => Promise<void>;
}

export const useProjectsStore = create<ProjectsState>((set, get) => ({
  projects: [],
  loading: false,
  refresh: async () => {
    set({ loading: true });
    const r = await commands.projectList();
    if (r.status === "ok") set({ projects: r.data });
    set({ loading: false });
  },
  create: async (name, description) => {
    const r = await commands.projectCreate({ name, description });
    if (r.status === "ok") {
      await get().refresh();
      return r.data;
    }
    return null;
  },
  remove: async (id) => {
    const r = await commands.projectDelete(id);
    if (r.status === "ok") await get().refresh();
  },
}));
