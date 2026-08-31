import { describe, expect, it } from "vitest";
import { BUNDLED_STAMPS, bundledStampBytes } from "../signatureStampAssets";

describe("bundled signature stamps", () => {
  it.each(BUNDLED_STAMPS)("ships $id as a PNG with transparency support", (stamp) => {
    const bytes = bundledStampBytes(stamp);

    // Oracle: the fixed eight-byte signature from the PNG specification.
    expect(bytes.slice(0, 8)).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(bytes.length).toBeGreaterThan(100);
  });
});
