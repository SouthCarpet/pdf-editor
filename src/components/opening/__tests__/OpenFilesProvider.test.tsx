import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@/i18n";
import { useDocuments } from "@/stores/documentStore";

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
});
