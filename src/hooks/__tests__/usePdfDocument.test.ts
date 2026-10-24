// Plan 119 p1: after a save the viewer shows the saved copy, so the saved
// values stay on the page. A second save to the same path must reload it,
// and the old document stays on screen while the new one loads, so the
// workspace does not unmount and lose its detected fields.
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fakes = vi.hoisted(() => ({
  readFile: vi.fn(),
  getDocument: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({ readFile: fakes.readFile }));
vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  getDocument: fakes.getDocument,
}));

import { usePdfDocument } from "../usePdfDocument";

const ORIGINAL = "A:\\docs\\timesheet-scan.pdf";
const SAVED = "A:\\docs\\timesheet-scan.filled.pdf";

function fakePdf(name: string) {
  return { name, numPages: 1, destroy: vi.fn() };
}

describe("usePdfDocument", () => {
  beforeEach(() => {
    fakes.readFile.mockReset();
    fakes.getDocument.mockReset();
    fakes.readFile.mockImplementation(async (path: string) => new TextEncoder().encode(path));
    fakes.getDocument.mockImplementation(({ data }: { data: Uint8Array }) => ({
      promise: Promise.resolve(fakePdf(new TextDecoder().decode(data))),
    }));
  });

  it("reads the given source file and reloads it on a new revision", async () => {
    const { result, rerender } = renderHook(
      ({ source, revision }) => usePdfDocument(ORIGINAL, source, revision),
      { initialProps: { source: ORIGINAL, revision: 0 } },
    );
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(fakes.readFile).toHaveBeenLastCalledWith(ORIGINAL);

    rerender({ source: SAVED, revision: 1 });
    await waitFor(() =>
      expect((result.current?.pdf as unknown as { name: string }).name).toBe(SAVED),
    );

    rerender({ source: SAVED, revision: 2 });
    await waitFor(() => expect(fakes.readFile).toHaveBeenCalledTimes(3));
    expect(fakes.readFile).toHaveBeenLastCalledWith(SAVED);
  });

  it("keeps the current document on screen while the saved copy loads", async () => {
    const { result, rerender } = renderHook(
      ({ source, revision }) => usePdfDocument(ORIGINAL, source, revision),
      { initialProps: { source: ORIGINAL, revision: 0 } },
    );
    await waitFor(() => expect(result.current).not.toBeNull());

    let release: () => void = () => {};
    fakes.readFile.mockImplementation(
      (path: string) =>
        new Promise((resolve) => {
          release = () => resolve(new TextEncoder().encode(path));
        }),
    );
    rerender({ source: SAVED, revision: 1 });

    expect((result.current?.pdf as unknown as { name: string }).name).toBe(ORIGINAL);
    await act(async () => release());
    await waitFor(() =>
      expect((result.current?.pdf as unknown as { name: string }).name).toBe(SAVED),
    );
  });

  it("shows nothing for a different document until it has loaded", async () => {
    const { result, rerender } = renderHook(({ path }) => usePdfDocument(path), {
      initialProps: { path: ORIGINAL as string | null },
    });
    await waitFor(() => expect(result.current).not.toBeNull());

    rerender({ path: "A:\\docs\\other.pdf" });

    expect(result.current).toBeNull();
  });
});
