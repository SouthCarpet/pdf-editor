// Plan 062 T1.3 R4: proportional scroll mapping is the product contract.
// Each literal expected value below comes from that contract, not from the
// implementation, and covers a distinct scroll-range boundary.
import { describe, expect, it } from "vitest";
import { mapSyncedScrollPosition } from "../compareScroll";

describe("mapSyncedScrollPosition", () => {
  it("maps halfway through one scroll range to halfway through the other", () => {
    expect(
      mapSyncedScrollPosition(
        { offset: 300, scrollSize: 1200, viewportSize: 600 },
        { scrollSize: 1800, viewportSize: 600 },
      ),
    ).toBe(600);
  });

  it("returns the top when the source has no scrollable range", () => {
    expect(
      mapSyncedScrollPosition(
        { offset: 0, scrollSize: 600, viewportSize: 600 },
        { scrollSize: 1800, viewportSize: 600 },
      ),
    ).toBe(0);
  });

  it("clamps a source offset past the end to the target end", () => {
    expect(
      mapSyncedScrollPosition(
        { offset: 900, scrollSize: 1200, viewportSize: 600 },
        { scrollSize: 1800, viewportSize: 600 },
      ),
    ).toBe(1200);
  });
});
