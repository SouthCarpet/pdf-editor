import { describe, expect, it, vi } from "vitest";
import type { SignatureRecord } from "@/bindings";
import { createSignatureStore, type SignatureBridge } from "../signatureStore";

const SAVED: SignatureRecord = {
  id: "signature-1",
  name: "Môj podpis",
  file_path: "A:\\signatures\\signature-1.png",
  width: 300,
  height: 100,
};

function fakeBridge(): SignatureBridge {
  return {
    signatureList: vi.fn().mockResolvedValue({ status: "ok", data: [SAVED] }),
    signatureImport: vi.fn().mockResolvedValue({ status: "ok", data: SAVED }),
    signatureCreateFromPngBytes: vi.fn().mockResolvedValue({ status: "ok", data: SAVED }),
    signatureRename: vi.fn().mockImplementation(async (_id: string, name: string) => ({
      status: "ok",
      data: { ...SAVED, name },
    })),
    signatureDelete: vi.fn().mockResolvedValue({ status: "ok", data: null }),
  };
}

describe("signatureStore", () => {
  it("loads the saved library through the signature bridge", async () => {
    const bridge = fakeBridge();
    const store = createSignatureStore(bridge);

    await store.getState().load();

    expect(store.getState().items).toEqual([SAVED]);
    expect(bridge.signatureList).toHaveBeenCalledOnce();
  });

  it("adds a newly drawn PNG to the front of the library", async () => {
    const bridge = fakeBridge();
    const store = createSignatureStore(bridge);

    const created = await store.getState().createFromPngBytes([137, 80, 78, 71], "Môj podpis");

    expect(created).toEqual(SAVED);
    expect(store.getState().items).toEqual([SAVED]);
    expect(bridge.signatureCreateFromPngBytes).toHaveBeenCalledWith(
      [137, 80, 78, 71],
      "Môj podpis",
    );
  });

  it("renames and deletes records only after the bridge succeeds", async () => {
    const bridge = fakeBridge();
    const store = createSignatureStore(bridge);
    await store.getState().load();

    await store.getState().rename(SAVED.id, "Faktúry");
    expect(store.getState().items[0].name).toBe("Faktúry");

    await store.getState().remove(SAVED.id);
    expect(store.getState().items).toEqual([]);
  });
});
