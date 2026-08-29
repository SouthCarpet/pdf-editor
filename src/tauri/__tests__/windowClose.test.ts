// Plan 050 task D2-UX-2 (fix wave F1): the close hook vetoes a close only
// when it is asked to, and never calls `destroy()` - the app has no
// `core:window:allow-destroy` permission, so a destroy would be a silent
// no-op and the window would never close.
import { describe, it, expect, vi, beforeEach } from "vitest";

const tauriWindow = vi.hoisted(() => ({
  handler: null as null | ((event: { preventDefault: () => void }) => void),
  unlisten: vi.fn(),
  close: vi.fn(async () => {}),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onCloseRequested: vi.fn(async (cb: (event: { preventDefault: () => void }) => void) => {
      tauriWindow.handler = cb;
      return tauriWindow.unlisten;
    }),
    close: tauriWindow.close,
  }),
}));

import { onWindowCloseRequested, requestWindowClose } from "../windowClose";

describe("windowClose", () => {
  beforeEach(() => {
    tauriWindow.handler = null;
    tauriWindow.unlisten.mockClear();
    tauriWindow.close.mockClear();
  });

  async function fireClose(): Promise<ReturnType<typeof vi.fn>> {
    const preventDefault = vi.fn();
    await tauriWindow.handler!({ preventDefault });
    return preventDefault;
  }

  it("lets the close through when nothing must be intercepted", async () => {
    await onWindowCloseRequested(() => false);
    expect(await fireClose()).not.toHaveBeenCalled();
  });

  it("vetoes the close when something must be intercepted", async () => {
    await onWindowCloseRequested(() => true);
    expect(await fireClose()).toHaveBeenCalledTimes(1);
  });

  it("re-asks the same decision on every close attempt", async () => {
    let dirty = true;
    await onWindowCloseRequested(() => dirty);
    expect(await fireClose()).toHaveBeenCalledTimes(1);
    dirty = false;
    expect(await fireClose()).not.toHaveBeenCalled();
  });

  it("returns the unlisten function", async () => {
    const stop = await onWindowCloseRequested(() => false);
    stop();
    expect(tauriWindow.unlisten).toHaveBeenCalledTimes(1);
  });

  it("requestWindowClose goes through the normal close path", async () => {
    await requestWindowClose();
    expect(tauriWindow.close).toHaveBeenCalledTimes(1);
  });
});
