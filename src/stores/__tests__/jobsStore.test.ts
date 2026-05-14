import { describe, it, expect, beforeEach } from "vitest";
import { useJobsStore } from "../jobsStore";

describe("jobsStore", () => {
  beforeEach(() => {
    useJobsStore.setState({ jobs: new Map() });
  });

  it("registers a started job in pending state", () => {
    useJobsStore.getState().start("j1", "merge", ["a.pdf", "b.pdf"]);
    const j = useJobsStore.getState().jobs.get("j1");
    expect(j?.status).toBe("pending");
    expect(j?.toolId).toBe("merge");
    expect(j?.progress).toBe(0);
    expect(j?.inputPaths).toEqual(["a.pdf", "b.pdf"]);
  });

  it("update patches an existing job without losing fields", () => {
    useJobsStore.getState().start("j1", "merge", ["a.pdf"]);
    useJobsStore.getState().update("j1", { status: "running", progress: 0.5, label: "merging" });
    const j = useJobsStore.getState().jobs.get("j1");
    expect(j?.status).toBe("running");
    expect(j?.progress).toBe(0.5);
    expect(j?.label).toBe("merging");
    expect(j?.toolId).toBe("merge");
  });

  it("update on an unknown id is a no-op (does not insert)", () => {
    useJobsStore.getState().update("missing", { status: "running" });
    expect(useJobsStore.getState().jobs.has("missing")).toBe(false);
  });

  it("finish marks job done with progress=1 and stores outputPaths", () => {
    useJobsStore.getState().start("j1", "split", ["src.pdf"]);
    useJobsStore.getState().finish("j1", ["out1.pdf", "out2.pdf"]);
    const j = useJobsStore.getState().jobs.get("j1");
    expect(j?.status).toBe("done");
    expect(j?.progress).toBe(1);
    expect(j?.outputPaths).toEqual(["out1.pdf", "out2.pdf"]);
    expect(j?.finishedAt).toBeTypeOf("number");
  });

  it("fail records error key + detail", () => {
    useJobsStore.getState().start("j1", "compress", ["a.pdf"]);
    useJobsStore.getState().fail("j1", "internal", "boom");
    const j = useJobsStore.getState().jobs.get("j1");
    expect(j?.status).toBe("error");
    expect(j?.error).toEqual({ key: "internal", detail: "boom" });
  });

  it("clearCompleted keeps running/pending and drops the rest", () => {
    const s = useJobsStore.getState();
    s.start("a", "merge", []);
    s.start("b", "merge", []);
    s.start("c", "merge", []);
    s.update("a", { status: "running" });
    s.finish("b", []);
    s.fail("c", "x");
    useJobsStore.getState().clearCompleted();
    const map = useJobsStore.getState().jobs;
    expect(map.has("a")).toBe(true);
    expect(map.has("b")).toBe(false);
    expect(map.has("c")).toBe(false);
  });

  it("cancel flips status to cancelled and stamps finishedAt", () => {
    useJobsStore.getState().start("j1", "ocr", ["a.pdf"]);
    useJobsStore.getState().cancel("j1");
    const j = useJobsStore.getState().jobs.get("j1");
    expect(j?.status).toBe("cancelled");
    expect(j?.finishedAt).toBeTypeOf("number");
  });
});
