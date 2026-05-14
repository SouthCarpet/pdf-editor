import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@/i18n";

const openMock = vi.fn();
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (...args: unknown[]) => openMock(...args),
}));

import { FileDropzone } from "../FileDropzone";

describe("FileDropzone", () => {
  beforeEach(() => {
    openMock.mockReset();
  });

  it("renders an Open button", () => {
    render(<FileDropzone onFiles={() => {}} />);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("forwards multiple selected paths through onFiles", async () => {
    openMock.mockResolvedValueOnce(["C:/a.pdf", "C:/b.pdf"]);
    const onFiles = vi.fn();
    render(<FileDropzone onFiles={onFiles} />);
    fireEvent.click(screen.getByRole("button"));
    await Promise.resolve();
    await Promise.resolve();
    expect(onFiles).toHaveBeenCalledWith(["C:/a.pdf", "C:/b.pdf"]);
  });

  it("wraps single-path selection into an array", async () => {
    openMock.mockResolvedValueOnce("C:/only.pdf");
    const onFiles = vi.fn();
    render(<FileDropzone multiple={false} onFiles={onFiles} />);
    fireEvent.click(screen.getByRole("button"));
    await Promise.resolve();
    await Promise.resolve();
    expect(onFiles).toHaveBeenCalledWith(["C:/only.pdf"]);
  });

  it("does not invoke onFiles when dialog returns null (cancel)", async () => {
    openMock.mockResolvedValueOnce(null);
    const onFiles = vi.fn();
    render(<FileDropzone onFiles={onFiles} />);
    fireEvent.click(screen.getByRole("button"));
    await Promise.resolve();
    await Promise.resolve();
    expect(onFiles).not.toHaveBeenCalled();
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
