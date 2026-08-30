import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@/i18n";
import { useAppStore } from "@/stores/appStore";
import { useDocuments } from "@/stores/documentStore";
import { useRecentFiles } from "@/stores/recentFilesStore";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  openDocument: vi.fn(),
  mergePdfs: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock("@/tauri/bridge", async () => (await import("@/test/fakeTauriBridge")).fakeBridge);

vi.mock("@/bindings", () => ({
  commands: {
    openDocument: (...args: unknown[]) => mocks.openDocument(...args),
    mergePdfsCmd: (...args: unknown[]) => mocks.mergePdfs(...args),
  },
}));

import { OpenFilesProvider } from "../OpenFilesProvider";
import { useOpenFiles } from "../openFilesContext";
import { fakeBridge, resetFakeBridge } from "@/test/fakeTauriBridge";

function Trigger({ paths }: { paths: string[] }) {
  const { requestOpen } = useOpenFiles();
  return <button onClick={() => requestOpen(paths)}>trigger</button>;
}

function opened(path: string) {
  return {
    status: "ok" as const,
    data: {
      path,
      page_count: 1,
      metadata: {
        title: null,
        author: null,
        subject: null,
        keywords: null,
        creator: null,
        producer: null,
        creation_date: null,
        modification_date: null,
      },
      is_encrypted: false,
      size_bytes: 100,
    },
  };
}

describe("OpenFilesProvider", () => {
  beforeEach(() => {
    mocks.navigate.mockReset().mockResolvedValue(undefined);
    resetFakeBridge();
    mocks.openDocument.mockReset();
    mocks.mergePdfs.mockReset();
    useDocuments.setState({ documents: new Map(), activeDocId: null });
    useRecentFiles.setState({ files: [], loading: false });
    useAppStore.setState({ openLastDocumentAtStart: false });
  });

  it("opens every selected PDF as a visible document tab", async () => {
    mocks.openDocument.mockImplementation(async (path: string) => opened(path));

    render(
      <OpenFilesProvider>
        <Trigger paths={["C:/a.pdf", "C:/b.pdf"]} />
      </OpenFilesProvider>,
    );

    fireEvent.click(screen.getByText("trigger"));
    expect(screen.getByText("Open 2 PDFs")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Open in new tabs"));

    await waitFor(() => expect(mocks.openDocument).toHaveBeenCalledTimes(2));
    expect(Array.from(useDocuments.getState().documents.keys())).toEqual([
      "C:/a.pdf",
      "C:/b.pdf",
    ]);
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/workspace/$docId",
      params: { docId: "C%3A%2Fb.pdf" },
    });
  });

  it("merges ordered PDFs before the active document and opens the result", async () => {
    useDocuments.getState().add({
      id: "C:/active.pdf",
      path: "C:/active.pdf",
      pageCount: 1,
      dirty: false,
    });
    fakeBridge.pickSavePath.mockResolvedValue("C:/merged.pdf");
    mocks.mergePdfs.mockResolvedValue({
      status: "ok",
      data: { output_paths: ["C:/merged.pdf"] },
    });
    mocks.openDocument.mockResolvedValue(opened("C:/merged.pdf"));

    render(
      <OpenFilesProvider>
        <Trigger paths={["C:/a.pdf", "C:/b.pdf"]} />
      </OpenFilesProvider>,
    );

    fireEvent.click(screen.getByText("trigger"));
    fireEvent.click(screen.getByText("Merge into one"));
    fireEvent.click(screen.getByText("Before active document"));
    fireEvent.click(screen.getByText("Save merged PDF"));

    await waitFor(() => expect(mocks.mergePdfs).toHaveBeenCalledTimes(1));
    expect(mocks.mergePdfs).toHaveBeenCalledWith({
      inputs: ["C:/a.pdf", "C:/b.pdf", "C:/active.pdf"],
      output: "C:/merged.pdf",
      job_id: expect.any(String),
    });
    await waitFor(() =>
      expect(useDocuments.getState().documents.has("C:/merged.pdf")).toBe(true),
    );
  });

  it("opens the most recent file at start when the setting is on and the file exists", async () => {
    useAppStore.setState({ openLastDocumentAtStart: true });
    fakeBridge.invokeCommand.mockResolvedValue([
      { path: "C:/last.pdf", display_name: "last.pdf", last_opened_at: "x" },
    ]);
    fakeBridge.pathExists.mockResolvedValue(true);
    mocks.openDocument.mockImplementation(async (path: string) => opened(path));

    render(
      <OpenFilesProvider>
        <div>child</div>
      </OpenFilesProvider>,
    );

    await waitFor(() => expect(mocks.openDocument).toHaveBeenCalledWith("C:/last.pdf"));
    expect(useAppStore.getState().openLastDocumentAtStart).toBe(true);
  });

  it("does nothing at start when the most recent file is gone and leaves the setting on", async () => {
    useAppStore.setState({ openLastDocumentAtStart: true });
    fakeBridge.invokeCommand.mockResolvedValue([
      { path: "C:/missing.pdf", display_name: "missing.pdf", last_opened_at: "x" },
    ]);
    fakeBridge.pathExists.mockResolvedValue(false);

    render(
      <OpenFilesProvider>
        <div>child</div>
      </OpenFilesProvider>,
    );

    await waitFor(() => expect(fakeBridge.pathExists).toHaveBeenCalledWith("C:/missing.pdf"));
    expect(mocks.openDocument).not.toHaveBeenCalled();
    expect(useAppStore.getState().openLastDocumentAtStart).toBe(true);
  });
});
