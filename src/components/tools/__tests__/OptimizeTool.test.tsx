import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import { fakeBridge, resetFakeBridge } from "@/test/fakeTauriBridge";
import { OptimizeTool } from "../OptimizeTool";

vi.mock("@/tauri/bridge", async () => (await import("@/test/fakeTauriBridge")).fakeBridge);

vi.mock("@/hooks/useToolJob", () => ({
  useToolJob: () => ({ run: vi.fn(), cancelActive: vi.fn(), activeId: null }),
}));

describe("OptimizeTool estimate panel", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(async () => {
    resetFakeBridge();
    await i18n.changeLanguage("sk");
    fakeBridge.pickPaths.mockResolvedValue(["A:\\docs\\report.pdf"]);
    fakeBridge.invokeCommand.mockResolvedValue({
      current_bytes: 4_200_000,
      estimated_bytes: 1_100_000,
      method: "dry_run",
      details: ["temporary output measured"],
    });
  });

  it("renders the measured estimate after a document is selected", async () => {
    vi.useFakeTimers();
    render(<OptimizeTool />);

    fireEvent.click(screen.getByRole("button", { name: "Otvoriť" }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText("Počítam odhad...")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(400);
      await Promise.resolve();
    });

    expect(screen.getByText("Odhad: 4,2 MB -> 1,1 MB (-74 %)")).toBeInTheDocument();
    expect(screen.getByText(/Rozdiel: 3,1 MB\. skúšobný beh/)).toBeInTheDocument();
    expect(fakeBridge.invokeCommand).toHaveBeenCalledWith(
      "estimate_optimize_cmd",
      expect.objectContaining({ args: expect.objectContaining({ input: "A:\\docs\\report.pdf" }) }),
    );
  });
});
