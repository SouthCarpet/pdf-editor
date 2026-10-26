import { beforeEach, describe, expect, it, vi } from "vitest";

const { checkForUpdate, getUpdateCheckEnabled, setUpdateCheckEnabled } = vi.hoisted(() => ({
  checkForUpdate: vi.fn(),
  getUpdateCheckEnabled: vi.fn(),
  setUpdateCheckEnabled: vi.fn(),
}));

vi.mock("@/bindings", () => ({
  commands: { checkForUpdate, getUpdateCheckEnabled, setUpdateCheckEnabled },
}));

import { useUpdateStore } from "../updateStore";

function release(status: string, latest: string | null = null, detail: string | null = null) {
  return { status, current_version: "0.1.0", latest_version: latest, release_url: null, detail };
}

describe("updateStore", () => {
  beforeEach(() => {
    checkForUpdate.mockReset();
    getUpdateCheckEnabled.mockReset();
    setUpdateCheckEnabled.mockReset();
    useUpdateStore.setState({
      enabled: null,
      consentError: null,
      savingConsent: false,
      result: null,
      checking: false,
      checkedAt: null,
      updateFlag: false,
      startRequested: false,
    });
  });

  it("makes no request at start, on About or on the button while consent is off", async () => {
    getUpdateCheckEnabled.mockResolvedValue({ status: "ok", data: false });

    await useUpdateStore.getState().check("start");
    await useUpdateStore.getState().check("about");
    await useUpdateStore.getState().check("manual");

    expect(checkForUpdate).not.toHaveBeenCalled();
  });

  it("makes no request when the consent cannot be read", async () => {
    getUpdateCheckEnabled.mockRejectedValue(new Error("ipc down"));

    await useUpdateStore.getState().check("about");

    expect(checkForUpdate).not.toHaveBeenCalled();
    expect(useUpdateStore.getState().enabled).toBe(false);
  });

  it("makes exactly one request at start even when the start effect runs twice", async () => {
    getUpdateCheckEnabled.mockResolvedValue({ status: "ok", data: true });
    checkForUpdate.mockResolvedValue(release("up_to_date", "0.1.0"));

    await useUpdateStore.getState().check("start");
    await useUpdateStore.getState().check("start");

    expect(checkForUpdate).toHaveBeenCalledTimes(1);
  });

  it("stays silent when the start check is offline", async () => {
    getUpdateCheckEnabled.mockResolvedValue({ status: "ok", data: true });
    checkForUpdate.mockResolvedValue(release("connection_error", null, "dns error"));

    await useUpdateStore.getState().check("start");

    expect(useUpdateStore.getState()).toMatchObject({
      result: null,
      checkedAt: null,
      updateFlag: false,
    });
  });

  it("marks a newer release found at start with the update flag only", async () => {
    getUpdateCheckEnabled.mockResolvedValue({ status: "ok", data: true });
    checkForUpdate.mockResolvedValue(release("available", "1.1.0"));

    await useUpdateStore.getState().check("start");

    expect(useUpdateStore.getState().updateFlag).toBe(true);
    expect(useUpdateStore.getState().result).toBeNull();
  });

  it("keeps a 403 answer from the About check as a response error", async () => {
    useUpdateStore.setState({ enabled: true });
    checkForUpdate.mockResolvedValue(release("response_error", null, "GitHub answered HTTP 403"));

    await useUpdateStore.getState().check("about");

    expect(useUpdateStore.getState().result?.status).toBe("response_error");
    expect(useUpdateStore.getState().result?.detail).toBe("GitHub answered HTTP 403");
  });

  it("turns a failed IPC call on the button into a connection error", async () => {
    useUpdateStore.setState({ enabled: true });
    checkForUpdate.mockRejectedValue(new Error("ipc down"));

    await useUpdateStore.getState().check("manual");

    expect(useUpdateStore.getState().result).toMatchObject({
      status: "connection_error",
      detail: "ipc down",
    });
  });

  it("shows a write error of the consent and keeps the old value", async () => {
    useUpdateStore.setState({ enabled: false });
    setUpdateCheckEnabled.mockResolvedValue({
      status: "error",
      error: { key: "io_error", data: { detail: "write settings.json: access denied" } },
    });

    await useUpdateStore.getState().setEnabled(true);

    expect(useUpdateStore.getState().enabled).toBe(false);
    expect(useUpdateStore.getState().consentError).toBe("write settings.json: access denied");
    expect(checkForUpdate).not.toHaveBeenCalled();
  });

  it("checks once right after the user turns consent on", async () => {
    useUpdateStore.setState({ enabled: false });
    setUpdateCheckEnabled.mockResolvedValue({ status: "ok", data: null });
    checkForUpdate.mockResolvedValue(release("up_to_date", "0.1.0"));

    await useUpdateStore.getState().setEnabled(true);

    expect(useUpdateStore.getState().enabled).toBe(true);
    expect(checkForUpdate).toHaveBeenCalledTimes(1);
  });
});
