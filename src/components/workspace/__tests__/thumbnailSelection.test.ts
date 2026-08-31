import { describe, expect, it } from "vitest";
import { thumbnailSelection } from "../thumbnailSelection";

describe("thumbnailSelection", () => {
  // Oracle: T3.2 R6 highlights both facing pages and focuses only activePage.
  it("highlights both pages in a book spread and focuses only the active page", () => {
    expect(thumbnailSelection(1, 2, 12, true)).toEqual({ highlighted: true, focused: false });
    expect(thumbnailSelection(2, 2, 12, true)).toEqual({ highlighted: true, focused: true });
    expect(thumbnailSelection(3, 2, 12, true)).toEqual({ highlighted: false, focused: false });
  });

  it("highlights only the focused page when book mode is off", () => {
    expect(thumbnailSelection(1, 2, 12, false)).toEqual({ highlighted: false, focused: false });
    expect(thumbnailSelection(2, 2, 12, false)).toEqual({ highlighted: true, focused: true });
  });

  it("does not highlight an empty cover well as another page", () => {
    expect(thumbnailSelection(0, 0, 12, true)).toEqual({ highlighted: true, focused: true });
    expect(thumbnailSelection(1, 0, 12, true)).toEqual({ highlighted: false, focused: false });
  });
});
