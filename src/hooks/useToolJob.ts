import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useEffect, useRef, useState } from "react";
import { useJobsStore } from "@/stores/jobsStore";
import { commands } from "@/tauri/commands";
import type { ProgressEvent } from "@/tauri/events";

interface ToolJobResult {
  id: string;
  outputPaths?: string[];
}

// Runs a single Tauri command as a "job":
// - generates a uuid client-side so progress events can be matched before the
//   command resolves
// - subscribes to `job:progress` events, mirrors them into the jobs store
// - resolves on command return; rejects + records the error key on failure
// - exposes `cancelActive()` which calls the `cancel_job` Tauri command
//   (registered in `commands::meta::cancel_job`) and flips the store state
export function useToolJob(toolId: string) {
  const { start, update, finish, fail, cancel } = useJobsStore();
  const [activeId, setActiveId] = useState<string | null>(null);
  const unlistenRef = useRef<UnlistenFn | null>(null);

  useEffect(() => {
    return () => {
      unlistenRef.current?.();
    };
  }, []);

  async function run<T>(
    commandName: string,
    args: Record<string, unknown>,
    inputPaths: string[],
  ): Promise<ToolJobResult> {
    const id = crypto.randomUUID();
    setActiveId(id);
    start(id, toolId, inputPaths);

    unlistenRef.current = await listen<ProgressEvent>("job:progress", (e) => {
      const ev = e.payload;
      if (ev.job_id !== id) return;
      switch (ev.type) {
        case "progress":
          update(id, { status: "running", progress: ev.ratio, label: ev.label });
          break;
        case "started":
          update(id, { status: "running", label: ev.label });
          break;
        case "done":
          finish(id, (ev.result as { outputPaths?: string[] } | undefined)?.outputPaths);
          break;
        case "error":
          fail(id, ev.key, ev.detail);
          break;
      }
    });

    try {
      const result = await invoke<T>(commandName, { ...args, jobId: id });
      const outputPaths = (result as { outputPaths?: string[] } | undefined)?.outputPaths;
      finish(id, outputPaths);
      return { id, outputPaths };
    } catch (e: unknown) {
      const errObj = e as { key?: string; data?: { detail?: string } };
      fail(id, errObj.key ?? "internal", errObj.data?.detail);
      throw e;
    } finally {
      setActiveId(null);
      unlistenRef.current?.();
      unlistenRef.current = null;
    }
  }

  async function cancelActive() {
    if (!activeId) return;
    // Generated specta binding — wraps the Tauri command + typed error envelope.
    await commands.cancelJob(activeId);
    cancel(activeId);
  }

  return { run, cancelActive, activeId };
}
