// Plan 119 p1 regression: a filled value must stay visible in every tool
// and sub-tool, not only in the ones that can edit it.
import { describe, expect, it } from "vitest";
import type { EditSubTool, WorkspaceTool } from "@/stores/workspaceStore";
import { pageOverlayMode, type PageOverlayInput } from "../pageOverlayMode";

function input(overrides: Partial<PageOverlayInput>): PageOverlayInput {
  return {
    activeTool: "edit",
    editSubTool: "forms",
    hasDetectedFields: false,
    hasPendingOnPage: false,
    placingStamp: false,
    ...overrides,
  };
}

const OTHER_TOOLS: WorkspaceTool[] = ["organize", "crop", "extract", "ocr", "compare"];
const EDITING_SUB_TOOLS: EditSubTool[] = ["forms", "annotations", "signature"];

describe("pageOverlayMode", () => {
  it("previews pending values read-only in the Text sub-tool", () => {
    expect(pageOverlayMode(input({ editSubTool: "text", hasPendingOnPage: true }))).toBe(
      "preview",
    );
  });

  it.each(OTHER_TOOLS)("previews pending values read-only in the %s tool", (activeTool) => {
    expect(pageOverlayMode(input({ activeTool, hasPendingOnPage: true }))).toBe("preview");
  });

  it.each(EDITING_SUB_TOOLS)("edits pending values in the %s sub-tool", (editSubTool) => {
    expect(pageOverlayMode(input({ editSubTool, hasPendingOnPage: true }))).toBe("edit");
  });

  it("edits when Forms has detected fields and nothing is filled yet", () => {
    expect(pageOverlayMode(input({ hasDetectedFields: true }))).toBe("edit");
  });

  it("does not show detected fields in the Annotations sub-tool", () => {
    expect(pageOverlayMode(input({ editSubTool: "annotations", hasDetectedFields: true }))).toBe(
      "none",
    );
  });

  it("edits while a signature stamp is being placed", () => {
    expect(pageOverlayMode(input({ editSubTool: "signature", placingStamp: true }))).toBe("edit");
  });

  it("mounts nothing when the page has no pending value", () => {
    expect(pageOverlayMode(input({ editSubTool: "text", hasDetectedFields: true }))).toBe("none");
    expect(pageOverlayMode(input({ activeTool: "crop" }))).toBe("none");
  });
});
