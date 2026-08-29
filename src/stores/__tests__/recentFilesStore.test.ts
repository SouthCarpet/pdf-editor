import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/tauri/bridge", async () => (await import("@/test/fakeTauriBridge")).fakeBridge);

import { fakeBridge, resetFakeBridge } from "@/test/fakeTauriBridge";
import { useRecentFiles } from "../recentFilesStore";

describe("recentFilesStore", () => {
  beforeEach(() => {
    useRecentFiles.setState({ files: [], loading: false });
    resetFakeBridge();
  });

  it("refresh flags loading while it runs and clears it once the files land", async () => {
    fakeBridge.invokeCommand.mockResolvedValue([
      {
        path: "C:/a.pdf",
        display_name: "a.pdf",
        last_opened_at: "2026-05-14T10:00:00Z",
      },
    ]);

    const promise = useRecentFiles.getState().refresh();
    expect(useRecentFiles.getState().loading).toBe(true);
    await promise;

    expect(useRecentFiles.getState().loading).toBe(false);
    expect(useRecentFiles.getState().files.map((f) => f.path)).toEqual([
      "C:/a.pdf",
    ]);
    expect(fakeBridge.invokeCommand).toHaveBeenCalledWith("recent_files_list", {
      limit: 20,
    });
  });

  it("remove prunes the file from local state without a second refresh", async () => {
    useRecentFiles.setState({
      files: [
        { path: "C:/a.pdf", display_name: "a.pdf", last_opened_at: "x" },
        { path: "C:/b.pdf", display_name: "b.pdf", last_opened_at: "y" },
      ],
      loading: false,
    });

    await useRecentFiles.getState().remove("C:/a.pdf");

    expect(useRecentFiles.getState().files.map((f) => f.path)).toEqual([
      "C:/b.pdf",
    ]);
    expect(fakeBridge.invokeCommand).toHaveBeenCalledWith(
      "recent_files_remove",
      { path: "C:/a.pdf" },
    );
  });

  it("refresh propagates the command failure to its caller", async () => {
    // The store must not swallow the rejection: Dashboard decides what a failed
    // read looks like, and a silently empty list would be indistinguishable
    // from a user who has opened nothing yet.
    fakeBridge.invokeCommand.mockRejectedValue(new Error("db locked"));

    await expect(useRecentFiles.getState().refresh()).rejects.toThrow(
      "db locked",
    );
    expect(useRecentFiles.getState().files).toEqual([]);
  });
});
