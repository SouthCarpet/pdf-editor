import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("@/tauri/bridge", async () => (await import("@/test/fakeTauriBridge")).fakeBridge);

const cancelJobMock = vi.fn();
vi.mock("@/tauri/commands", () => ({
  commands: {
    cancelJob: (...args: unknown[]) => cancelJobMock(...args),
  },
}));

import { fakeBridge, resetFakeBridge } from "@/test/fakeTauriBridge";
import { useToolJob } from "../useToolJob";
import { useJobsStore } from "@/stores/jobsStore";

describe("useToolJob", () => {
  beforeEach(() => {
    useJobsStore.setState({ jobs: new Map() });
    resetFakeBridge();
    cancelJobMock.mockReset();
  });

  it("calls the command with the caller's args plus a generated jobId", async () => {
    fakeBridge.invokeCommand.mockResolvedValue({ outputPaths: ["out.pdf"] });
    const { result } = renderHook(() => useToolJob("merge"));

    let returned: { id: string; outputPaths?: string[] } | undefined;
    await act(async () => {
      returned = await result.current.run<{ outputPaths?: string[] }>(
        "merge_cmd",
        { foo: 1 },
        ["a.pdf"],
      );
    });

    expect(fakeBridge.invokeCommand).toHaveBeenCalledTimes(1);
    const [command, args] = fakeBridge.invokeCommand.mock.calls[0];
    expect(command).toBe("merge_cmd");
    expect(args).toEqual({ foo: 1, jobId: returned!.id });
    expect(returned?.outputPaths).toEqual(["out.pdf"]);
  });

  it("injects jobId into args.args when the command wraps params under `args`", async () => {
    fakeBridge.invokeCommand.mockResolvedValue({});
    const { result } = renderHook(() => useToolJob("compress"));

    let returned: { id: string } | undefined;
    await act(async () => {
      returned = await result.current.run("compress_cmd", { args: { foo: "x" } }, [
        "a.pdf",
      ]);
    });

    const [, callArgs] = fakeBridge.invokeCommand.mock.calls[0];
    expect((callArgs as { args: unknown }).args).toEqual({
      foo: "x",
      jobId: returned!.id,
    });
  });

  it("records the error key and detail in the jobs store when the command rejects", async () => {
    fakeBridge.invokeCommand.mockRejectedValue({
      key: "sidecar_failed",
      data: { detail: "boom" },
    });
    const { result } = renderHook(() => useToolJob("ocr"));

    await act(async () => {
      await expect(result.current.run("ocr_cmd", {}, ["scan.pdf"])).rejects.toEqual({
        key: "sidecar_failed",
        data: { detail: "boom" },
      });
    });

    const jobs = Array.from(useJobsStore.getState().jobs.values());
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe("error");
    expect(jobs[0].error?.key).toBe("sidecar_failed");
    expect(jobs[0].error?.detail).toBe("boom");
  });

  it("mirrors a progress event for the running job into the jobs store", async () => {
    // `run` subscribes before it awaits the command, so the event that arrives
    // mid-run is the one a user sees as a moving progress bar. Capturing the
    // handler is how the test delivers that event without a timer.
    let emit: ((payload: unknown) => void) | undefined;
    let signalSubscribed: (() => void) | undefined;
    const subscribed = new Promise<void>((resolve) => {
      signalSubscribed = resolve;
    });
    fakeBridge.listenEvent.mockImplementation(
      async (_event: string, handler: (payload: unknown) => void) => {
        emit = handler;
        signalSubscribed!();
        return () => {};
      },
    );
    let resolveCommand: ((value: unknown) => void) | undefined;
    fakeBridge.invokeCommand.mockReturnValue(
      new Promise((resolve) => {
        resolveCommand = resolve;
      }),
    );

    const { result } = renderHook(() => useToolJob("merge"));

    let run: Promise<{ id: string }> | undefined;
    await act(async () => {
      run = result.current.run("merge_cmd", {}, ["a.pdf"]);
      await subscribed;
    });

    const jobId = Array.from(useJobsStore.getState().jobs.keys())[0];
    await act(async () => {
      emit!({ type: "progress", job_id: jobId, ratio: 0.5, label: "merging" });
    });

    expect(useJobsStore.getState().jobs.get(jobId)?.progress).toBe(0.5);
    expect(useJobsStore.getState().jobs.get(jobId)?.label).toBe("merging");

    await act(async () => {
      resolveCommand!({});
      await run;
    });
  });

  it("ignores a progress event addressed to a different job", async () => {
    let emit: ((payload: unknown) => void) | undefined;
    let signalSubscribed: (() => void) | undefined;
    const subscribed = new Promise<void>((resolve) => {
      signalSubscribed = resolve;
    });
    fakeBridge.listenEvent.mockImplementation(
      async (_event: string, handler: (payload: unknown) => void) => {
        emit = handler;
        signalSubscribed!();
        return () => {};
      },
    );
    let resolveCommand: ((value: unknown) => void) | undefined;
    fakeBridge.invokeCommand.mockReturnValue(
      new Promise((resolve) => {
        resolveCommand = resolve;
      }),
    );

    const { result } = renderHook(() => useToolJob("merge"));

    let run: Promise<{ id: string }> | undefined;
    await act(async () => {
      run = result.current.run("merge_cmd", {}, ["a.pdf"]);
      await subscribed;
    });

    const jobId = Array.from(useJobsStore.getState().jobs.keys())[0];
    await act(async () => {
      emit!({
        type: "progress",
        job_id: "some-other-job",
        ratio: 0.9,
        label: "not mine",
      });
    });

    expect(useJobsStore.getState().jobs.get(jobId)?.progress).toBe(0);

    await act(async () => {
      resolveCommand!({});
      await run;
    });
  });

  it("cancelActive is a no-op when no job is running", async () => {
    const { result } = renderHook(() => useToolJob("merge"));
    await act(async () => {
      await result.current.cancelActive();
    });
    expect(cancelJobMock).not.toHaveBeenCalled();
  });
});
