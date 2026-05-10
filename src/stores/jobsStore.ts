import { create } from "zustand";

export type JobStatus = "pending" | "running" | "done" | "error" | "cancelled";

export interface Job {
  id: string;
  toolId: string;
  status: JobStatus;
  progress: number;
  label?: string;
  inputPaths: string[];
  outputPaths?: string[];
  error?: { key: string; detail?: string };
  startedAt: number;
  finishedAt?: number;
}

interface JobsState {
  jobs: Map<string, Job>;
  start: (id: string, toolId: string, inputPaths: string[]) => void;
  update: (id: string, patch: Partial<Job>) => void;
  finish: (id: string, outputPaths?: string[]) => void;
  fail: (id: string, key: string, detail?: string) => void;
  cancel: (id: string) => void;
  remove: (id: string) => void;
  clearCompleted: () => void;
}

export const useJobsStore = create<JobsState>((set) => ({
  jobs: new Map(),
  start: (id, toolId, inputPaths) =>
    set((s) => {
      const m = new Map(s.jobs);
      m.set(id, {
        id,
        toolId,
        status: "pending",
        progress: 0,
        inputPaths,
        startedAt: Date.now(),
      });
      return { jobs: m };
    }),
  update: (id, patch) =>
    set((s) => {
      const m = new Map(s.jobs);
      const cur = m.get(id);
      if (cur) m.set(id, { ...cur, ...patch });
      return { jobs: m };
    }),
  finish: (id, outputPaths) =>
    set((s) => {
      const m = new Map(s.jobs);
      const cur = m.get(id);
      if (cur)
        m.set(id, {
          ...cur,
          status: "done",
          progress: 1,
          outputPaths,
          finishedAt: Date.now(),
        });
      return { jobs: m };
    }),
  fail: (id, key, detail) =>
    set((s) => {
      const m = new Map(s.jobs);
      const cur = m.get(id);
      if (cur)
        m.set(id, {
          ...cur,
          status: "error",
          error: { key, detail },
          finishedAt: Date.now(),
        });
      return { jobs: m };
    }),
  cancel: (id) =>
    set((s) => {
      const m = new Map(s.jobs);
      const cur = m.get(id);
      if (cur) m.set(id, { ...cur, status: "cancelled", finishedAt: Date.now() });
      return { jobs: m };
    }),
  remove: (id) =>
    set((s) => {
      const m = new Map(s.jobs);
      m.delete(id);
      return { jobs: m };
    }),
  clearCompleted: () =>
    set((s) => {
      const m = new Map<string, Job>();
      for (const [k, v] of s.jobs)
        if (v.status === "running" || v.status === "pending") m.set(k, v);
      return { jobs: m };
    }),
}));
