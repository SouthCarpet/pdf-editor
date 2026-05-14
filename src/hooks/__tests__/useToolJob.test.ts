import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const invokeMock = vi.fn();
const listenMock = vi.fn();
const unlistenMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: (...args: unknown[]) => listenMock(...args),
}));

const cancelJobMock = vi.fn();
vi.mock("@/tauri/commands", () => ({
  commands: {
    cancelJob: (...args: unknown[]) => cancelJobMock(...args),
  },
}));

import { useToolJob } from "../useToolJob";
import { useJobsStore } from "@/stores/jobsStore";

describe("useToolJob", () => {
  beforeEach(() => {
    useJobsStore.setState({ jobs: new Map() });
    invokeMock.mockReset();
    listenMock.mockReset();
    unlistenMock.mockReset();
    cancelJobMock.mockReset();
    listenMock.mockResolvedValue(unlistenMock);
  });

  it("calls invoke with the command, args, and injects jobId", async () => {
    invokeMock.mockResolvedValueOnce({ outputPaths: ["out.pdf"] });
    const { result } = renderHook(() => useToolJob("merge"));

    let returned: { id: string; outputPaths?: string[] } | undefined;
    await act(async () => {
      returned = await result.current.run<{ outputPaths?: string[] }>(
        "merge_cmd",
        { foo: 1 },
        ["a.pdf"],
      );
    });

    expect(invokeMock).toHaveBeenCalledTimes(1);
    const [cmd, args] = invokeMock.mock.calls[0];
    expect(cmd).toBe("merge_cmd");
    expect((args as { foo: number }).foo).toBe(1);
    expect((args as { jobId: string }).jobId).toBeTypeOf("string");
    expect(returned?.outputPaths).toEqual(["out.pdf"]);
  });

  it("injects jobId into args.args when the command wraps params under `args`", async () => {
    invokeMock.mockResolvedValueOnce({});
    const { result } = renderHook(() => useToolJob("compress"));

    await act(async () => {
      await result.current.run("compress_cmd", { args: { foo: "x" } }, ["a.pdf"]);
    });

    const [, callArgs] = invokeMock.mock.calls[0];
    const inner = (callArgs as { args: Record<string, unknown> }).args;
    expect(inner.foo).toBe("x");
    expect(inner.jobId).toBeTypeOf("string");
  });

  it("records error key when invoke rejects", async () => {
    invokeMock.mockRejectedValueOnce({ key: "sidecar_failed", data: { detail: "boom" } });
    const { result } = renderHook(() => useToolJob("ocr"));

    await act(async () => {
      await expect(
        result.current.run("ocr_cmd", {}, ["scan.pdf"]),
      ).rejects.toBeDefined();
    });

    const all = Array.from(useJobsStore.getState().jobs.values());
    expect(all).toHaveLength(1);
    expect(all[0].status).toBe("error");
    expect(all[0].error?.key).toBe("sidecar_failed");
    expect(all[0].error?.detail).toBe("boom");
  });

  it("cancelActive is a no-op when no job is running", async () => {
    const { result } = renderHook(() => useToolJob("merge"));
    await act(async () => {
      await result.current.cancelActive();
    });
    expect(cancelJobMock).not.toHaveBeenCalled();
  });
});
