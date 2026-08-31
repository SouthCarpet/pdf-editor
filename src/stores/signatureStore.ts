import { create } from "zustand";
import { commands, type SignatureRecord } from "@/bindings";

type BridgeResult<T> =
  | { status: "ok"; data: T }
  | { status: "error"; error: { key: string; data: unknown } };

export interface SignatureBridge {
  signatureList: () => Promise<BridgeResult<SignatureRecord[]>>;
  signatureImport: (path: string) => Promise<BridgeResult<SignatureRecord>>;
  signatureCreateFromPngBytes: (
    bytes: number[],
    name: string,
  ) => Promise<BridgeResult<SignatureRecord>>;
  signatureRename: (id: string, name: string) => Promise<BridgeResult<SignatureRecord>>;
  signatureDelete: (id: string) => Promise<BridgeResult<null>>;
}

interface SignatureState {
  items: SignatureRecord[];
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
  importPath: (path: string) => Promise<SignatureRecord | null>;
  createFromPngBytes: (bytes: number[], name: string) => Promise<SignatureRecord | null>;
  rename: (id: string, name: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

function errorText(result: Extract<BridgeResult<unknown>, { status: "error" }>): string {
  return result.error.key;
}

export function createSignatureStore(bridge: SignatureBridge) {
  return create<SignatureState>((set) => ({
    items: [],
    loading: false,
    error: null,
    load: async () => {
      set({ loading: true, error: null });
      const result = await bridge.signatureList();
      if (result.status === "error") {
        set({ loading: false, error: errorText(result) });
        return;
      }
      set({ items: result.data, loading: false });
    },
    importPath: async (path) => {
      set({ error: null });
      const result = await bridge.signatureImport(path);
      if (result.status === "error") {
        set({ error: errorText(result) });
        return null;
      }
      set((state) => ({ items: [result.data, ...state.items] }));
      return result.data;
    },
    createFromPngBytes: async (bytes, name) => {
      set({ error: null });
      const result = await bridge.signatureCreateFromPngBytes(bytes, name);
      if (result.status === "error") {
        set({ error: errorText(result) });
        return null;
      }
      set((state) => ({ items: [result.data, ...state.items] }));
      return result.data;
    },
    rename: async (id, name) => {
      set({ error: null });
      const result = await bridge.signatureRename(id, name);
      if (result.status === "error") {
        set({ error: errorText(result) });
        return;
      }
      set((state) => ({
        items: state.items.map((item) => (item.id === id ? result.data : item)),
      }));
    },
    remove: async (id) => {
      set({ error: null });
      const result = await bridge.signatureDelete(id);
      if (result.status === "error") {
        set({ error: errorText(result) });
        return;
      }
      set((state) => ({ items: state.items.filter((item) => item.id !== id) }));
    },
  }));
}

export const useSignatureStore = createSignatureStore({
  signatureList: () => commands.signatureList(),
  signatureImport: (path) => commands.signatureImport(path),
  signatureCreateFromPngBytes: (bytes, name) =>
    commands.signatureCreateFromPngBytes(bytes, name),
  signatureRename: (id, name) => commands.signatureRename(id, name),
  signatureDelete: (id) => commands.signatureDelete(id),
});
