import { describe, it, expect, beforeEach } from "vitest";
import { useDocuments } from "../documentStore";

describe("documentStore", () => {
  beforeEach(() => {
    useDocuments.setState({ documents: new Map(), activeDocId: null });
  });

  it("add inserts a doc and sets it active", () => {
    useDocuments.getState().add({
      id: "d1",
      path: "C:/a.pdf",
      pageCount: 3,
      dirty: false,
    });
    const s = useDocuments.getState();
    expect(s.documents.get("d1")?.pageCount).toBe(3);
    expect(s.activeDocId).toBe("d1");
  });

  it("setActive accepts null to clear selection", () => {
    useDocuments.getState().add({ id: "d1", path: "C:/a.pdf", pageCount: 1, dirty: false });
    useDocuments.getState().setActive(null);
    expect(useDocuments.getState().activeDocId).toBeNull();
  });

  it("markDirty updates only the targeted doc", () => {
    useDocuments.getState().add({ id: "d1", path: "C:/a.pdf", pageCount: 1, dirty: false });
    useDocuments.getState().add({ id: "d2", path: "C:/b.pdf", pageCount: 2, dirty: false });
    useDocuments.getState().markDirty("d1", true);
    const s = useDocuments.getState();
    expect(s.documents.get("d1")?.dirty).toBe(true);
    expect(s.documents.get("d2")?.dirty).toBe(false);
  });

  it("markDirty on missing id is a no-op", () => {
    useDocuments.getState().markDirty("ghost", true);
    expect(useDocuments.getState().documents.size).toBe(0);
  });

  it("close removes the doc and clears active when it was the active one", () => {
    useDocuments.getState().add({ id: "d1", path: "C:/a.pdf", pageCount: 1, dirty: false });
    useDocuments.getState().add({ id: "d2", path: "C:/b.pdf", pageCount: 2, dirty: false });
    expect(useDocuments.getState().activeDocId).toBe("d2");
    useDocuments.getState().close("d2");
    expect(useDocuments.getState().documents.has("d2")).toBe(false);
    expect(useDocuments.getState().activeDocId).toBeNull();
  });

  it("close preserves activeDocId when closing a non-active doc", () => {
    useDocuments.getState().add({ id: "d1", path: "C:/a.pdf", pageCount: 1, dirty: false });
    useDocuments.getState().add({ id: "d2", path: "C:/b.pdf", pageCount: 2, dirty: false });
    useDocuments.getState().close("d1");
    expect(useDocuments.getState().activeDocId).toBe("d2");
  });
});
