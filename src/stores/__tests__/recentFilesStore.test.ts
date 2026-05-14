import { describe, it, expect, beforeEach, vi } from "vitest";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

// Importing after the mock so the store picks up the mocked invoke.
import { useRecentFiles } from "../recentFilesStore";

describe("recentFilesStore", () => {
  beforeEach(() => {
    useRecentFiles.setState({ files: [], loading: false });
    invokeMock.mockReset();
  });

  it("refresh sets loading true, then false and stores files", async () => {
    invokeMock.mockResolvedValueOnce([
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
    expect(useRecentFiles.getState().files).toHaveLength(1);
    expect(invokeMock).toHaveBeenCalledWith("recent_files_list", { limit: 20 });
  });

  it("remove invokes recent_files_remove and prunes the file from local state", async () => {
    useRecentFiles.setState({
      files: [
        {
          path: "C:/a.pdf",
          display_name: "a.pdf",
          last_opened_at: "x",
        },
        {
          path: "C:/b.pdf",
          display_name: "b.pdf",
          last_opened_at: "y",
        },
      ],
      loading: false,
    });
    invokeMock.mockResolvedValueOnce(null);
    await useRecentFiles.getState().remove("C:/a.pdf");
    expect(invokeMock).toHaveBeenCalledWith("recent_files_remove", {
      path: "C:/a.pdf",
    });
    expect(useRecentFiles.getState().files.map((f) => f.path)).toEqual([
      "C:/b.pdf",
    ]);
  });

  it("refresh propagates the rejected promise on invoke failure", async () => {
    invokeMock.mockRejectedValueOnce(new Error("db locked"));
    await expect(useRecentFiles.getState().refresh()).rejects.toThrow("db locked");
  });
});
