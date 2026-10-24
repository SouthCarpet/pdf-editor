// The onboarding tour (intro.js). `Onboarding` runs it on the first start;
// "Show tour again" in the help panel runs it on request through `replayTour`.
import type { TFunction } from "i18next";
import introJs from "intro.js";
import "intro.js/introjs.css";

export const ONBOARDED_KEY = "onboarded";
/** The tiles + settings tab mount on the Dashboard / TopBar routes; wait a
 * frame so they're in the DOM before introJs scans for them. */
export const TOUR_START_DELAY_MS = 350;

export function runTour(t: TFunction<"common">): void {
  const markDone = () => localStorage.setItem(ONBOARDED_KEY, "1");
  try {
    introJs()
      .setOptions({
        showProgress: true,
        showBullets: false,
        scrollToElement: true,
        prevLabel: t("onboarding.back"),
        nextLabel: t("onboarding.next"),
        doneLabel: t("onboarding.done"),
        steps: [
          { intro: t("onboarding.welcome") },
          { element: ".tool-tile-merge", intro: t("onboarding.tools") },
          { element: "[data-onboard='settings']", intro: t("onboarding.settings") },
          { intro: t("onboarding.drag_tip") },
        ],
      })
      .oncomplete(markDone)
      .onexit(markDone)
      .start();
  } catch {
    // The tour is a convenience; never block the app on it.
    markDone();
  }
}

/** Start the tour again on request. The caller shows the Dashboard first. */
export function replayTour(t: TFunction<"common">): void {
  window.setTimeout(() => runTour(t), TOUR_START_DELAY_MS);
}
