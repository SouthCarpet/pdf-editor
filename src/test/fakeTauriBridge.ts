// Fake for `@/tauri/bridge`, the app's own adapter over Tauri's runtime APIs.
//
// Tests replace the seam we own instead of the vendor packages behind it:
//
//   vi.mock("@/tauri/bridge", async () =>
//     (await import("@/test/fakeTauriBridge")).fakeBridge,
//   );
//   import { fakeBridge, emitFileDrop, resetFakeBridge } from "@/test/fakeTauriBridge";
//
// The same module instance backs both the mock and the import, so a test
// configures `fakeBridge.pickPaths` and the component under test sees it.
//
// Defaults model the quiet case: every dialog is cancelled, every command
// returns null, nothing is listening. A test states only what it cares about.
import { vi } from "vitest";
import type { FileDropEvent } from "@/tauri/bridge";

type DropHandler = (event: FileDropEvent) => void;

const dropHandlers = new Set<DropHandler>();

export const fakeBridge = {
  pickPaths: vi.fn<() => Promise<string[]>>(async () => []),
  pickSavePath: vi.fn<() => Promise<string | null>>(async () => null),
  pathExists: vi.fn<(path: string) => Promise<boolean>>(async () => false),
  fileMtimeMs: vi.fn<(path: string) => Promise<number | null>>(async () => null),
  revealSavedFile: vi.fn<(path: string) => Promise<void>>(async () => {}),
  invokeCommand: vi.fn<(command: string, args?: unknown) => Promise<unknown>>(
    async () => null,
  ),
  listenEvent: vi.fn(
    async (_event: string, _handler: (payload: unknown) => void) => () => {},
  ),
  onFileDrop: vi.fn(async (handler: DropHandler) => {
    dropHandlers.add(handler);
    return () => {
      dropHandlers.delete(handler);
    };
  }),
};

/** Delivers a native OS drop to whatever the app subscribed with `onFileDrop`. */
export function emitFileDrop(event: FileDropEvent): void {
  for (const handler of dropHandlers) handler(event);
}

/** Restores the defaults above. Call from `beforeEach`. */
export function resetFakeBridge(): void {
  dropHandlers.clear();
  fakeBridge.pickPaths.mockReset().mockResolvedValue([]);
  fakeBridge.pickSavePath.mockReset().mockResolvedValue(null);
  fakeBridge.pathExists.mockReset().mockResolvedValue(false);
  fakeBridge.fileMtimeMs.mockReset().mockResolvedValue(null);
  fakeBridge.revealSavedFile.mockReset().mockResolvedValue(undefined);
  fakeBridge.invokeCommand.mockReset().mockResolvedValue(null);
  fakeBridge.listenEvent
    .mockReset()
    .mockImplementation(async (_event, _handler) => () => {});
  fakeBridge.onFileDrop.mockReset().mockImplementation(async (handler) => {
    dropHandlers.add(handler);
    return () => {
      dropHandlers.delete(handler);
    };
  });
}
