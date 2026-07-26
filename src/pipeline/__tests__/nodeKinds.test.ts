import { describe, expect, it } from "vitest";
import { NODE_KINDS, nodeKindByKey, payloadToRust } from "../nodeKinds";

describe("Open file pipeline node", () => {
  it("is registered as the first input step", () => {
    const openFile = nodeKindByKey("open_file");

    expect(openFile.category).toBe("input");
    expect(NODE_KINDS.findIndex((node) => node.key === "open_file")).toBe(0);
    expect(openFile.defaultPayload()).toEqual({
      kind: "open_file",
      paths: [],
    });
  });

  it("serializes selected paths for the Rust DAG", () => {
    expect(
      payloadToRust({
        kind: "open_file",
        paths: ["C:\\docs\\one.pdf", "C:\\docs\\two.pdf"],
      }),
    ).toEqual({
      type: "open_file",
      paths: ["C:\\docs\\one.pdf", "C:\\docs\\two.pdf"],
    });
  });
});
