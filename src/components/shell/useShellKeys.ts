import { useEffect } from "react";

/** F1 toggles the help panel; Ctrl+comma opens Settings (Kaliber shell core).
 * Ctrl+Alt (AltGr) and the Command key never count. */
export function useShellKeys(toggleHelp: () => void, openSettings: () => void): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "F1") {
        event.preventDefault();
        toggleHelp();
      } else if (event.key === "," && event.ctrlKey && !event.altKey && !event.metaKey) {
        event.preventDefault();
        openSettings();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleHelp, openSettings]);
}
