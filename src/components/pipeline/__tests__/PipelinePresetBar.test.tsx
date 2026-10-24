import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "@/i18n";

const presetDelete = vi.fn();
const preset = {
  id: 7,
  name: "Monthly scans",
  description: null,
  graph_json: JSON.stringify({ nodes: [{ id: "a" }, { id: "b" }, { id: "c" }], edges: [] }),
};

vi.mock("@/bindings", () => ({
  commands: {
    pipelinePresetList: vi.fn(async () => ({ status: "ok", data: [preset] })),
    pipelinePresetDelete: (...args: unknown[]) => presetDelete(...args),
    pipelinePresetCreate: vi.fn(),
  },
}));

import { PipelinePresetBar } from "../PipelinePresetBar";

describe("PipelinePresetBar delete (Kaliber dialog)", () => {
  beforeEach(async () => {
    presetDelete.mockReset().mockResolvedValue({ status: "ok", data: null });
    await i18n.changeLanguage("en");
  });

  it("asks in a dialog that names the preset and its step count, and deletes only on confirm", async () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    const user = userEvent.setup();
    render(<PipelinePresetBar />);
    await user.click(screen.getByRole("button", { name: "Load preset" }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Delete preset “Monthly scans”?");
    expect(dialog).toHaveTextContent("The preset has 3 steps.");
    expect(presetDelete).not.toHaveBeenCalled();
    expect(confirmSpy).not.toHaveBeenCalled();

    await user.click(screen.getAllByRole("button", { name: "Delete" }).at(-1)!);
    await waitFor(() => expect(presetDelete).toHaveBeenCalledWith(7));
  });

  it("keeps the preset when the dialog is cancelled", async () => {
    const user = userEvent.setup();
    render(<PipelinePresetBar />);
    await user.click(screen.getByRole("button", { name: "Load preset" }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(presetDelete).not.toHaveBeenCalled();
  });

  it("uses the Slovak plural for the step count", async () => {
    await i18n.changeLanguage("sk");
    const user = userEvent.setup();
    render(<PipelinePresetBar />);
    await user.click(screen.getByRole("button", { name: "Načítať predvoľbu" }));
    await user.click(await screen.findByRole("button", { name: "Zmazať" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("Predvoľba má 3 kroky.");
    await i18n.changeLanguage("en");
  });
});
