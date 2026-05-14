// Phase 17 Task 88 — First-run onboarding tour via intro.js.
//
// Mounts once at app root. On first run (no `onboarded=1` in
// localStorage) it walks the user through:
//   1. welcome
//   2. tool tiles (find one via the `tool-tile-merge` class hook in
//      ToolTile.tsx)
//   3. settings button (via the data-onboard="settings" hook in
//      TopBar.tsx)
//   4. drag-PDFs-onto-any-tool hint
//
// After completion the `onboarded` localStorage flag is set so the
// tour never auto-replays. (A Settings entry can clear it for a
// manual re-run.)
import { useEffect } from "react";
import introJs from "intro.js";
import "intro.js/introjs.css";

export function Onboarding() {
  useEffect(() => {
    if (localStorage.getItem("onboarded") === "1") return;
    // The tiles + settings button mount on the Dashboard / TopBar
    // routes; wait a frame so they're in the DOM before introJs scans
    // for them.
    const handle = setTimeout(() => {
      try {
        introJs()
          .setOptions({
            showProgress: true,
            showBullets: false,
            scrollToElement: true,
            steps: [
              {
                intro:
                  "Welcome to PDF Editor. Fully offline, no paywalls, all tools run locally.",
              },
              {
                element: ".tool-tile-merge",
                intro: "Click any tile to start a tool.",
              },
              {
                element: "[data-onboard='settings']",
                intro: "Theme and language live here.",
              },
              {
                intro: "Tip: you can drag a PDF onto any tool tile to start it pre-loaded.",
              },
            ],
          })
          .oncomplete(() => {
            localStorage.setItem("onboarded", "1");
          })
          .onexit(() => {
            localStorage.setItem("onboarded", "1");
          })
          .start();
      } catch {
        // The tour is a convenience; never block the app on it.
        localStorage.setItem("onboarded", "1");
      }
    }, 350);
    return () => clearTimeout(handle);
  }, []);
  return null;
}
