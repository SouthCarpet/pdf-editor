import { fireEvent, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useShellKeys } from "../useShellKeys";

function setup() {
  const toggleHelp = vi.fn();
  const openSettings = vi.fn();
  const view = renderHook(() => useShellKeys(toggleHelp, openSettings));
  return { toggleHelp, openSettings, ...view };
}

describe("useShellKeys", () => {
  it("F1 toggles the help panel and nothing else", () => {
    const { toggleHelp, openSettings } = setup();
    fireEvent.keyDown(window, { key: "F1" });
    expect(toggleHelp).toHaveBeenCalledTimes(1);
    expect(openSettings).not.toHaveBeenCalled();
  });

  it("Ctrl+comma opens Settings", () => {
    const { toggleHelp, openSettings } = setup();
    fireEvent.keyDown(window, { key: ",", ctrlKey: true });
    expect(openSettings).toHaveBeenCalledTimes(1);
    expect(toggleHelp).not.toHaveBeenCalled();
  });

  it.each([
    ["comma alone", { key: "," }],
    ["Ctrl+Alt+comma (AltGr)", { key: ",", ctrlKey: true, altKey: true }],
    ["Command+comma", { key: ",", ctrlKey: true, metaKey: true }],
    ["Ctrl+period", { key: ".", ctrlKey: true }],
  ])("ignores %s", (_name, init) => {
    const { toggleHelp, openSettings } = setup();
    fireEvent.keyDown(window, init);
    expect(toggleHelp).not.toHaveBeenCalled();
    expect(openSettings).not.toHaveBeenCalled();
  });

  it("stops listening after unmount", () => {
    const { toggleHelp, unmount } = setup();
    unmount();
    fireEvent.keyDown(window, { key: "F1" });
    expect(toggleHelp).not.toHaveBeenCalled();
  });
});
