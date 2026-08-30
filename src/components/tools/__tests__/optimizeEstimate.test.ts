import { afterEach, describe, expect, it, vi } from "vitest";
import { estimatePercent, formatBytes, scheduleEstimate } from "../optimizeEstimate";

describe("optimize estimate helpers", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    [999, "999 B"],
    [1_500, "1,5 kB"],
    [4_200_000, "4,2 MB"],
  ])("formats %i bytes with Slovak decimal punctuation as %s", (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });

  it("runs an estimate after the 400 ms debounce", () => {
    vi.useFakeTimers();
    const task = vi.fn();

    scheduleEstimate(task);
    vi.advanceTimersByTime(399);
    expect(task).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);

    expect(task).toHaveBeenCalledOnce();
  });

  it("does not run an estimate after its scheduler is cancelled", () => {
    vi.useFakeTimers();
    const task = vi.fn();

    const cancel = scheduleEstimate(task);
    cancel();
    vi.advanceTimersByTime(400);

    expect(task).not.toHaveBeenCalled();
  });

  it("reports measured growth as a positive percentage", () => {
    expect(
      estimatePercent({
        current_bytes: 1_000,
        estimated_bytes: 1_125,
        method: "dry_run",
        details: [],
      }),
    ).toBe(13);
  });
});
