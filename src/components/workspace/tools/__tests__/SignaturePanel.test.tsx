import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/i18n";
import type { SignatureRecord } from "@/bindings";

const SAVED: SignatureRecord = {
  id: "saved-signature",
  name: "Môj podpis",
  file_path: "A:\\signatures\\saved-signature.png",
  width: 300,
  height: 100,
};

const commandFakes = vi.hoisted(() => ({
  signatureList: vi.fn(),
  signatureImport: vi.fn(),
  signatureCreateFromPngBytes: vi.fn(),
  signatureRename: vi.fn(),
  signatureDelete: vi.fn(),
}));
const dialogFakes = vi.hoisted(() => ({ open: vi.fn() }));
const fsFakes = vi.hoisted(() => ({ readFile: vi.fn() }));

vi.mock("@/bindings", () => ({ commands: commandFakes }));
vi.mock("@tauri-apps/plugin-dialog", () => dialogFakes);
vi.mock("@tauri-apps/plugin-fs", () => fsFakes);

import { useSignatureStore } from "@/stores/signatureStore";
import { SignaturePanel } from "../SignaturePanel";

describe("SignaturePanel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useSignatureStore.setState({ items: [], loading: false, error: null });
    commandFakes.signatureList.mockReset();
    commandFakes.signatureImport.mockReset();
    commandFakes.signatureCreateFromPngBytes.mockReset();
    commandFakes.signatureRename.mockReset();
    commandFakes.signatureDelete.mockReset();
    dialogFakes.open.mockReset();
    fsFakes.readFile.mockReset();
    commandFakes.signatureList.mockResolvedValue({ status: "ok", data: [SAVED] });
    commandFakes.signatureDelete.mockResolvedValue({ status: "ok", data: null });
    fsFakes.readFile.mockImplementation(() => new Promise(() => undefined));
  });

  it("loads saved signatures and chooses one through its visible button", async () => {
    const onChoose = vi.fn();
    const user = userEvent.setup();
    render(<SignaturePanel onChoose={onChoose} />);
    const place = await screen.findByRole("button", { name: "Place Môj podpis" });

    await user.click(place);

    expect(onChoose).toHaveBeenCalledWith(SAVED);
  });

  it("imports a PNG through the mocked Tauri bridge and selects it", async () => {
    const imported = { ...SAVED, id: "imported", name: "Pečiatka" };
    dialogFakes.open.mockResolvedValue("A:\\images\\peciatka.png");
    commandFakes.signatureImport.mockResolvedValue({ status: "ok", data: imported });
    const onChoose = vi.fn();
    const user = userEvent.setup();
    render(<SignaturePanel onChoose={onChoose} />);

    await user.click(screen.getByRole("button", { name: "Upload image" }));

    await waitFor(() => expect(commandFakes.signatureImport).toHaveBeenCalledWith(
      "A:\\images\\peciatka.png",
    ));
    expect(onChoose).toHaveBeenCalledWith(imported);
  });

  it("asks for confirmation before deleting a saved signature", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    render(<SignaturePanel onChoose={() => undefined} />);
    const remove = await screen.findByRole("button", { name: "Delete Môj podpis" });

    await user.click(remove);

    await waitFor(() => expect(commandFakes.signatureDelete).toHaveBeenCalledWith(SAVED.id));
  });

  it("rasterises a named drawing at two-times resolution and saves PNG bytes", async () => {
    const context = {
      setTransform: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      save: vi.fn(),
      clearRect: vi.fn(),
      restore: vi.fn(),
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => {
      callback(new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }));
    });
    commandFakes.signatureCreateFromPngBytes.mockResolvedValue({ status: "ok", data: SAVED });
    const user = userEvent.setup();
    render(<SignaturePanel onChoose={() => undefined} />);

    await user.click(screen.getByRole("button", { name: "Draw" }));
    const canvas = screen.getByLabelText("Signature drawing area") as HTMLCanvasElement;
    await user.type(screen.getByLabelText("Signature name"), "Invoices");
    await user.click(screen.getByRole("button", { name: "Save as signature" }));

    expect(canvas.width).toBe(960);
    expect(canvas.height).toBe(360);
    expect(context.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
    await waitFor(() =>
      expect(commandFakes.signatureCreateFromPngBytes).toHaveBeenCalledWith(
        [137, 80, 78, 71],
        "Invoices",
      ),
    );
  });
});
