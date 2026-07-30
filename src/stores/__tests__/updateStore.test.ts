import { beforeEach, describe, expect, it, vi } from "vitest";

const { launchUpdate } = vi.hoisted(() => ({
  launchUpdate: vi.fn(),
}));

vi.mock("@/bindings", () => ({
  commands: {
    checkForUpdate: vi.fn(),
    launchUpdate,
  },
}));

import { useUpdateStore } from "../updateStore";

describe("updateStore", () => {
  beforeEach(() => {
    launchUpdate.mockReset();
    useUpdateStore.setState({
      result: null,
      checking: false,
      checkedAt: null,
      dismissed: false,
      launching: false,
      launchError: null,
    });
  });

  it("surfaces a typed updater launch error", async () => {
    launchUpdate.mockResolvedValue({ status: "error", error: "script missing" });

    await useUpdateStore.getState().launch();

    expect(useUpdateStore.getState()).toMatchObject({
      launching: false,
      launchError: "script missing",
      dismissed: false,
    });
  });

  it("keeps the launching state while a successful command exits the app", async () => {
    launchUpdate.mockResolvedValue({ status: "ok", data: null });

    await useUpdateStore.getState().launch();

    expect(useUpdateStore.getState()).toMatchObject({
      launching: true,
      launchError: null,
    });
  });
});
