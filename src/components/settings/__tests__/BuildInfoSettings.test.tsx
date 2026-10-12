// Plan 119: the About section shows the release version and runs the
// update check only behind the stored consent.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "@/i18n";
import { useUpdateStore } from "@/stores/updateStore";

const { buildInfo, checkForUpdate, getUpdateCheckEnabled, setUpdateCheckEnabled } = vi.hoisted(
  () => ({
    buildInfo: vi.fn(),
    checkForUpdate: vi.fn(),
    getUpdateCheckEnabled: vi.fn(),
    setUpdateCheckEnabled: vi.fn(),
  }),
);

vi.mock("@/bindings", () => ({
  commands: { buildInfo, checkForUpdate, getUpdateCheckEnabled, setUpdateCheckEnabled },
}));

import { BuildInfoSettings } from "../BuildInfoSettings";

function release(status: string, latest: string | null, detail: string | null = null) {
  return { status, current_version: "0.1.0", latest_version: latest, release_url: null, detail };
}

describe("BuildInfoSettings (About)", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    buildInfo.mockReset().mockResolvedValue({ version: "0.1.0", commit: "f8a068f39185", dirty: false });
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

  it("shows the release version and the short commit", async () => {
    getUpdateCheckEnabled.mockResolvedValue({ status: "ok", data: false });

    render(<BuildInfoSettings />);

    expect(await screen.findByText("0.1.0")).toBeInTheDocument();
    expect(screen.getByText(/f8a068f3/)).toBeInTheDocument();
  });

  it("with consent off makes no request on open and keeps the button disabled", async () => {
    getUpdateCheckEnabled.mockResolvedValue({ status: "ok", data: false });

    render(<BuildInfoSettings />);

    expect(await screen.findByTestId("update-status")).toHaveTextContent("Update checks are off");
    expect(screen.getByRole("button", { name: "Check now" })).toBeDisabled();
    expect(checkForUpdate).not.toHaveBeenCalled();
  });

  it("with consent on checks once on open and names the latest version", async () => {
    getUpdateCheckEnabled.mockResolvedValue({ status: "ok", data: true });
    checkForUpdate.mockResolvedValue(release("up_to_date", "0.1.0"));

    render(<BuildInfoSettings />);

    expect(await screen.findByText("You have the latest version (0.1.0)")).toBeInTheDocument();
    expect(checkForUpdate).toHaveBeenCalledTimes(1);
  });

  it("shows a connection error differently from the latest version", async () => {
    getUpdateCheckEnabled.mockResolvedValue({ status: "ok", data: true });
    checkForUpdate.mockResolvedValue(release("connection_error", null, "dns error"));

    render(<BuildInfoSettings />);

    expect(await screen.findByText("Cannot reach GitHub: dns error")).toBeInTheDocument();
  });

  it("the button runs one more check", async () => {
    getUpdateCheckEnabled.mockResolvedValue({ status: "ok", data: true });
    checkForUpdate.mockResolvedValue(release("available", "1.1.0"));
    render(<BuildInfoSettings />);
    await screen.findByText("Version 1.1.0 is available on GitHub");

    await userEvent.click(screen.getByRole("button", { name: "Check now" }));

    await waitFor(() => expect(checkForUpdate).toHaveBeenCalledTimes(2));
  });

  it("shows a consent write error as an alert", async () => {
    getUpdateCheckEnabled.mockResolvedValue({ status: "ok", data: false });
    setUpdateCheckEnabled.mockResolvedValue({
      status: "error",
      error: { key: "io_error", data: { detail: "access denied" } },
    });
    render(<BuildInfoSettings />);
    const consent = await screen.findByRole("checkbox", { name: "Check GitHub for new versions" });
    await waitFor(() => expect(consent).toBeEnabled());

    await userEvent.click(consent);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The setting was not saved: access denied",
    );
    expect(consent).not.toBeChecked();
  });
});
