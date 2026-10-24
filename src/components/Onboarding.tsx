// Phase 17 Task 88: First-run onboarding tour via intro.js.
//
// Mounts once at app root. On first run (no `onboarded=1` in
// localStorage) it walks the user through:
//   1. welcome
//   2. tool tiles (find one via the `tool-tile-merge` class hook in
//      ToolTile.tsx)
//   3. settings tab (via the data-onboard="settings" hook in
//      TopBar.tsx)
//   4. drag-PDFs-onto-any-tool hint
//
// After completion the `onboarded` localStorage flag is set so the
// tour never auto-replays. Kaliber r4: "Show tour again" in the help panel
// (F1) runs the same tour (see shell/tour.ts).
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ONBOARDED_KEY, runTour, TOUR_START_DELAY_MS } from "./shell/tour";

export function Onboarding() {
  const { t } = useTranslation("common");
  useEffect(() => {
    if (localStorage.getItem(ONBOARDED_KEY) === "1") return;
    const handle = setTimeout(() => runTour(t), TOUR_START_DELAY_MS);
    return () => clearTimeout(handle);
  }, [t]);
  return null;
}
