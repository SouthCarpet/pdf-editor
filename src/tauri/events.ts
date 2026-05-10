import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type ProgressEvent =
  | { type: "started"; job_id: string; label?: string }
  | { type: "progress"; job_id: string; ratio: number; label?: string }
  | { type: "done"; job_id: string; result?: unknown }
  | { type: "error"; job_id: string; key: string; detail?: string };

export async function onProgress(
  jobId: string,
  cb: (e: ProgressEvent) => void,
): Promise<UnlistenFn> {
  return listen<ProgressEvent>("job:progress", (event) => {
    if (event.payload.job_id === jobId) cb(event.payload);
  });
}
