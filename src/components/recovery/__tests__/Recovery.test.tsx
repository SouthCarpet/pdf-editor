import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { axe } from "vitest-axe";
import i18n from "@/i18n";
import { commands } from "@/bindings";
import { RecoveryWizard } from "../RecoveryWizard";
import { RecoveryWarningModal } from "../RecoveryWarningModal";

vi.mock("@/bindings", () => ({ commands: { recoveryAttempt: vi.fn(), cancelJob: vi.fn() } }));

beforeEach(async () => {
  await i18n.changeLanguage("en");
  // The bundled local wordlist is served by Vite in the app, absent in jsdom.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("alpha\nbeta\n"))
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe("Recovery choices and states", () => {
  it.each(["Dictionary", "Mask", "Brute force"])(
    "has labelled controls in %s mode",
    async (mode) => {
      const { container } = render(<RecoveryWizard inputPath="A:/test/locked.pdf" />);
      fireEvent.click(screen.getByRole("radio", { name: mode }));
      expect((await axe(container)).violations).toEqual([]);
    }
  );

  it("explains the unavailable mask mode and keeps its run action disabled", async () => {
    render(<RecoveryWizard inputPath="A:/test/locked.pdf" />);
    fireEvent.click(screen.getByRole("radio", { name: "Mask" }));
    expect(screen.getByText("Mask recovery is not yet implemented.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Mask" })).toBeDisabled();
  });

  it("disables brute force after the last character set is removed", () => {
    render(<RecoveryWizard inputPath="A:/test/locked.pdf" />);
    fireEvent.click(screen.getByRole("radio", { name: "Brute force" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Digits 0-9" }));
    expect(screen.getByRole("button", { name: "Start · Brute force" })).toBeDisabled();
  });

  it("announces the password returned by brute force recovery", async () => {
    vi.mocked(commands.recoveryAttempt).mockResolvedValue({
      status: "ok",
      data: { password: "123" },
    });
    render(<RecoveryWizard inputPath="A:/test/locked.pdf" />);
    fireEvent.click(screen.getByRole("radio", { name: "Brute force" }));
    fireEvent.click(screen.getByRole("button", { name: "Start · Brute force" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Password found: 123")
    );
  });

  it("locks mode choices while recovery runs and keeps Stop available", async () => {
    vi.mocked(commands.recoveryAttempt).mockReturnValue(new Promise(() => {}));
    render(<RecoveryWizard inputPath="A:/test/locked.pdf" />);
    fireEvent.click(screen.getByRole("radio", { name: "Brute force" }));
    fireEvent.click(screen.getByRole("button", { name: "Start · Brute force" }));
    expect(screen.getByRole("group", { name: "Recovery mode" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Stop" })).toBeEnabled();
    expect(screen.getByRole("status")).toHaveTextContent("Running");
  });

  it("cancels the legal warning with Escape", () => {
    const cancel = vi.fn();
    render(<RecoveryWarningModal open onCancel={cancel} onConfirm={vi.fn()} />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("confirms recovery only from the acknowledgement action", () => {
    const confirm = vi.fn();
    render(<RecoveryWarningModal open onCancel={vi.fn()} onConfirm={confirm} />);
    fireEvent.click(screen.getByRole("button", { name: "I understand" }));
    expect(confirm).toHaveBeenCalledOnce();
  });
});
