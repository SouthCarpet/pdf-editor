import { describe, it, expect, beforeEach } from "vitest";
import { useWorkspace } from "../workspaceStore";

describe("workspaceStore", () => {
  beforeEach(() => {
    useWorkspace.setState({
      activeTool: "edit",
      editSubTool: "forms",
      activePage: 0,
      zoom: 1.0,
    });
  });

  it("setTool changes the active workspace tool", () => {
    useWorkspace.getState().setTool("crop");
    expect(useWorkspace.getState().activeTool).toBe("crop");
  });

  it("setEditSubTool switches between forms/annotations/text", () => {
    useWorkspace.getState().setEditSubTool("text");
    expect(useWorkspace.getState().editSubTool).toBe("text");
  });

  it("setActivePage clamps negatives to 0", () => {
    useWorkspace.getState().setActivePage(-5);
    expect(useWorkspace.getState().activePage).toBe(0);
  });

  it("setZoom clamps below 0.25", () => {
    useWorkspace.getState().setZoom(0.01);
    expect(useWorkspace.getState().zoom).toBe(0.25);
  });

  it("setZoom clamps above 4", () => {
    useWorkspace.getState().setZoom(100);
    expect(useWorkspace.getState().zoom).toBe(4);
  });

  it("setZoom accepts mid-range values verbatim", () => {
    useWorkspace.getState().setZoom(1.75);
    expect(useWorkspace.getState().zoom).toBe(1.75);
  });
});
