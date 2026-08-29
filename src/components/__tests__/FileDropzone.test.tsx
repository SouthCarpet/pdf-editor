import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "@/i18n";

vi.mock("@/tauri/bridge", async () => (await import("@/test/fakeTauriBridge")).fakeBridge);

import { fakeBridge, resetFakeBridge } from "@/test/fakeTauriBridge";
import { FileDropzone } from "../FileDropzone";

describe("FileDropzone", () => {
  beforeEach(async () => {
    resetFakeBridge();
    await i18n.changeLanguage("en");
  });

  it("renders an Open button", () => {
    render(<FileDropzone onFiles={() => {}} />);
    expect(screen.getByRole("button", { name: "Open" })).toBeInTheDocument();
  });

  it("forwards every selected path through onFiles", async () => {
    const user = userEvent.setup();
    fakeBridge.pickPaths.mockResolvedValue(["C:/a.pdf", "C:/b.pdf"]);
    const onFiles = vi.fn();
    render(<FileDropzone onFiles={onFiles} />);

    await user.click(screen.getByRole("button", { name: "Open" }));

    await waitFor(() =>
      expect(onFiles).toHaveBeenCalledWith(["C:/a.pdf", "C:/b.pdf"]),
    );
  });

  it("asks for a single path when multiple is false", async () => {
    const user = userEvent.setup();
    fakeBridge.pickPaths.mockResolvedValue(["C:/only.pdf"]);
    const onFiles = vi.fn();
    render(<FileDropzone multiple={false} onFiles={onFiles} />);

    await user.click(screen.getByRole("button", { name: "Open" }));

    await waitFor(() => expect(onFiles).toHaveBeenCalledWith(["C:/only.pdf"]));
    expect(fakeBridge.pickPaths).toHaveBeenCalledWith(
      expect.objectContaining({ multiple: false }),
    );
  });

  it("does not invoke onFiles when the user cancels the dialog", async () => {
    // A cancelled dialog produces no visible change, and waiting for nothing to
    // happen is not an observable condition. So the cancel is paired with a
    // second, successful pick: onFiles must fire exactly once, carrying only
    // the paths from the pick that was not cancelled.
    const user = userEvent.setup();
    fakeBridge.pickPaths
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(["C:/second.pdf"]);
    const onFiles = vi.fn();
    render(<FileDropzone onFiles={onFiles} />);

    await user.click(screen.getByRole("button", { name: "Open" }));
    await user.click(screen.getByRole("button", { name: "Open" }));

    await waitFor(() => expect(onFiles).toHaveBeenCalledWith(["C:/second.pdf"]));
    expect(onFiles).toHaveBeenCalledTimes(1);
  });

  it("renders custom children when provided", () => {
    render(
      <FileDropzone onFiles={() => {}}>
        <p>custom placeholder</p>
      </FileDropzone>,
    );
    expect(screen.getByText("custom placeholder")).toBeInTheDocument();
  });
});
