import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@/i18n";
import { useAppStore } from "@/stores/appStore";
import { useDocuments } from "@/stores/documentStore";
import { useRecentFiles } from "@/stores/recentFilesStore";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  openDocument: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock("@/tauri/bridge", async () => (await import("@/test/fakeTauriBridge")).fakeBridge);

vi.mock("@/bindings", () => ({
  commands: {
    openDocument: (...args: unknown[]) => mocks.openDocument(...args),
  },
}));

import { OpenFilesProvider } from "../OpenFilesProvider";
import { useOpenFiles } from "../openFilesContext";
import {
  emitFileDrop,
  emitOpenPaths,
  fakeBridge,
  resetFakeBridge,
} from "@/test/fakeTauriBridge";

function BrowseTrigger() {
  const { browseForPdfs } = useOpenFiles();
  return <button onClick={() => void browseForPdfs()}>browse</button>;
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
    useDocuments.setState({ documents: new Map(), activeDocId: null });
    useRecentFiles.setState({ files: [], loading: false });
    useAppStore.setState({ openLastDocumentAtStart: false });
  });

  it("opens every PDF selected by the multi-file picker and focuses the last tab", async () => {
    fakeBridge.pickPaths.mockResolvedValue(["C:/a.pdf", "C:/b.pdf"]);
    mocks.openDocument.mockImplementation(async (path: string) => opened(path));

    render(
      <OpenFilesProvider>
        <BrowseTrigger />
      </OpenFilesProvider>,
    );

    fireEvent.click(screen.getByText("browse"));

    await waitFor(() => expect(mocks.openDocument).toHaveBeenCalledTimes(2));
    expect(fakeBridge.pickPaths).toHaveBeenCalledWith({
      multiple: true,
      directory: false,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    expect(Array.from(useDocuments.getState().documents.keys())).toEqual([
      "C:/a.pdf",
      "C:/b.pdf",
    ]);
    expect(mocks.navigate).toHaveBeenCalledOnce();
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/workspace/$docId",
      params: { docId: "C%3A%2Fb.pdf" },
    });
  });

  it("shows the drop target, opens dropped PDFs, and reports ignored files", async () => {
    mocks.openDocument.mockImplementation(async (path: string) => opened(path));
    render(
      <OpenFilesProvider>
        <div>home</div>
      </OpenFilesProvider>,
    );
    await waitFor(() => expect(fakeBridge.onFileDrop).toHaveBeenCalledOnce());

    act(() => emitFileDrop({ kind: "over" }));
    expect(screen.getByText("Drop PDFs to open")).toBeInTheDocument();

    await act(async () => {
      emitFileDrop({ kind: "drop", paths: ["C:/form.pdf", "C:/notes.txt"] });
    });

    await waitFor(() => expect(mocks.openDocument).toHaveBeenCalledWith("C:/form.pdf"));
    expect(screen.queryByText("Drop PDFs to open")).not.toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent("Non-PDF files were ignored.");
  });

  // Oracle: 119-K5 finding 7 / R25. Error feedback uses one hairline,
  // without a floating shadow.
  it("shows an opening error with a hairline and no shadow utility", async () => {
    render(<OpenFilesProvider><div>home</div></OpenFilesProvider>);
    await waitFor(() => expect(fakeBridge.onFileDrop).toHaveBeenCalledOnce());
    await act(async () => emitFileDrop({ kind: "drop", paths: ["C:/notes.txt"] }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveClass("border", "border-[var(--color-danger)]");
    expect(alert.className).not.toMatch(/\bshadow-\S+/);
  });

  it("opens startup paths returned by the mocked Tauri bridge", async () => {
    fakeBridge.startupPaths.mockResolvedValue(["C:/startup.pdf"]);
    mocks.openDocument.mockImplementation(async (path: string) => opened(path));

    render(
      <OpenFilesProvider>
        <div>home</div>
      </OpenFilesProvider>,
    );

    await waitFor(() => expect(mocks.openDocument).toHaveBeenCalledWith("C:/startup.pdf"));
    expect(useDocuments.getState().activeDocId).toBe("C:/startup.pdf");
  });

  it("opens paths forwarded by a second application process", async () => {
    mocks.openDocument.mockImplementation(async (path: string) => opened(path));
    render(
      <OpenFilesProvider>
        <div>home</div>
      </OpenFilesProvider>,
    );
    await waitFor(() => expect(fakeBridge.onOpenPaths).toHaveBeenCalledOnce());

    await act(async () => emitOpenPaths(["C:/second-instance.pdf"]));

    await waitFor(() =>
      expect(mocks.openDocument).toHaveBeenCalledWith("C:/second-instance.pdf"),
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
        <div>home</div>
      </OpenFilesProvider>,
    );

    await waitFor(() => expect(mocks.openDocument).toHaveBeenCalledWith("C:/last.pdf"));
    expect(useAppStore.getState().openLastDocumentAtStart).toBe(true);
  });

  it("leaves the setting on when the most recent file no longer exists", async () => {
    useAppStore.setState({ openLastDocumentAtStart: true });
    fakeBridge.invokeCommand.mockResolvedValue([
      { path: "C:/missing.pdf", display_name: "missing.pdf", last_opened_at: "x" },
    ]);
    fakeBridge.pathExists.mockResolvedValue(false);

    render(
      <OpenFilesProvider>
        <div>home</div>
      </OpenFilesProvider>,
    );

    await waitFor(() => expect(fakeBridge.pathExists).toHaveBeenCalledWith("C:/missing.pdf"));
    expect(mocks.openDocument).not.toHaveBeenCalled();
    expect(useAppStore.getState().openLastDocumentAtStart).toBe(true);
  });

  // Oracle: the existing startup error fallbacks keep the app open and the
  // stored preference unchanged. These branches moved in the K5 lint split.
  it("still restores the recent file when startup arguments cannot be read", async () => {
    fakeBridge.startupPaths.mockRejectedValue(new Error("no arguments"));
    useAppStore.setState({ openLastDocumentAtStart: true });
    fakeBridge.invokeCommand.mockResolvedValue([
      { path: "C:/last.pdf", display_name: "last.pdf", last_opened_at: "x" },
    ]);
    fakeBridge.pathExists.mockResolvedValue(true);
    mocks.openDocument.mockImplementation(async (path: string) => opened(path));
    render(<OpenFilesProvider><div>home</div></OpenFilesProvider>);
    await waitFor(() => expect(useDocuments.getState().activeDocId).toBe("C:/last.pdf"));
  });

  it("keeps the setting on without opening a recent file when its disk check fails", async () => {
    useAppStore.setState({ openLastDocumentAtStart: true });
    fakeBridge.invokeCommand.mockResolvedValue([
      { path: "C:/last.pdf", display_name: "last.pdf", last_opened_at: "x" },
    ]);
    fakeBridge.pathExists.mockRejectedValue(new Error("disk unavailable"));
    render(<OpenFilesProvider><div>home</div></OpenFilesProvider>);
    await waitFor(() => expect(fakeBridge.pathExists).toHaveBeenCalledWith("C:/last.pdf"));
    expect(mocks.openDocument).not.toHaveBeenCalled();
    expect(useAppStore.getState().openLastDocumentAtStart).toBe(true);
  });
});
