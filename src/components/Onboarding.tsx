// Phase 17 Task 88 — First-run onboarding (placeholder stub).
//
// The real intro.js tour is wired in the Task 88 commit; this file
// reserves the export so Layout can mount it conditionally without a
// chunked dependency on the install order. Once intro.js is added,
// this becomes the introJs().setOptions(...).start() trigger.
import { useEffect } from "react";

export function Onboarding() {
  useEffect(() => {
    // The Task 88 commit replaces this body with the introJs tour.
  }, []);
  return null;
}
