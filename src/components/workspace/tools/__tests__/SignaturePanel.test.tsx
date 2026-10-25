import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
const tokenFakes = vi.hoisted(() => ({ readToken: vi.fn() }));

vi.mock("@/bindings", () => ({ commands: commandFakes }));
vi.mock("@tauri-apps/plugin-dialog", () => dialogFakes);
vi.mock("@tauri-apps/plugin-fs", () => fsFakes);
vi.mock("@/lib/tokens", () => ({ readToken: tokenFakes.readToken }));

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
    tokenFakes.readToken.mockReset();
    tokenFakes.readToken.mockImplementation((name: string, fallback: string) =>
      name === "--color-text"
        ? "rgb(10, 20, 30)"
        : name === "--color-accent"
          ? "rgb(40, 50, 60)"
          : fallback,
    );
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
    // K4 carried item: the in-app dialog names the item. Cancel is safe.
    const nativeConfirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();
    render(<SignaturePanel onChoose={() => undefined} />);
    const remove = await screen.findByRole("button", { name: "Delete Môj podpis" });

    await user.click(remove);

    expect(screen.getByRole("dialog")).toHaveTextContent('Delete saved signature “Môj podpis”?');
    expect(commandFakes.signatureDelete).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(remove);
    await user.click(screen.getByRole("button", { name: /^Delete$/ }));
    await waitFor(() => expect(commandFakes.signatureDelete).toHaveBeenCalledWith(SAVED.id));
    expect(nativeConfirm).not.toHaveBeenCalled();
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

  it("draws with a themed ink colour, not a fixed hex (Minor 2 / F8)", async () => {
    // A literal near-black ("#111827") nearly vanishes on the dark canvas
    // background. Ink must come from `readToken`.
    const context = {
      setTransform: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      save: vi.fn(),
      clearRect: vi.fn(),
      restore: vi.fn(),
      strokeStyle: "",
      lineWidth: 0,
      lineCap: "",
      lineJoin: "",
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    );
    const user = userEvent.setup();
    render(<SignaturePanel onChoose={() => undefined} />);
    await user.click(screen.getByRole("button", { name: "Draw" }));

    expect(tokenFakes.readToken).toHaveBeenCalledWith("--color-text", expect.any(String));
    expect(tokenFakes.readToken).toHaveBeenCalledWith("--color-accent", expect.any(String));

    const blackSwatch = screen.getByRole("button", { name: "Black" }).querySelector("span");
    const blueSwatch = screen.getByRole("button", { name: "Blue" }).querySelector("span");
    expect(blackSwatch).toHaveStyle({ backgroundColor: "rgb(10, 20, 30)" });
    expect(blueSwatch).toHaveStyle({ backgroundColor: "rgb(40, 50, 60)" });

    await user.click(screen.getByRole("button", { name: "Blue" }));
    const canvas = screen.getByLabelText("Signature drawing area");
    // jsdom does not implement the Pointer Capture API.
    canvas.setPointerCapture = vi.fn();
    fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10 });
    expect(context.strokeStyle).toBe("rgb(40, 50, 60)");
  });
});
