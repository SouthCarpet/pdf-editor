import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "@/i18n";
import { ExtractPageCard, ExtractPanel } from "../ExtractPanel";
import { parsePageRanges } from "../extractSelection";

vi.mock("@/hooks/usePdfDocument", () => ({
  usePdfDocument: () => ({ pdf: { numPages: 12 }, numPages: 12 }),
}));
vi.mock("../../PdfViewer", () => ({
  PdfViewer: ({ pageIndex }: { pageIndex: number }) => (
    <div data-testid={`thumbnail-${pageIndex}`} />
  ),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: vi.fn() }));
vi.mock("@/bindings", () => ({ commands: { extractPagesCmd: vi.fn() } }));

describe("parsePageRanges", () => {
  it.each([
    ["1-3, 5", 6, [0, 1, 2, 4]],
    ["0, 99", 5, [0, 4]],
    ["5-3", 6, [2, 3, 4]],
    ["2, nope, 4-x, 6", 6, [1, 5]],
    ["", 6, []],
  ])("parses %j", (text, count, expected) => {
    expect([...parsePageRanges(text, count)]).toEqual(expected);
  });
});

describe("ExtractPanel selection", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("selects all, clears, and inverts", async () => {
    const user = userEvent.setup();
    render(<ExtractPanel docPath="C:\\input.pdf" pageCount={3} />);
    const inputs = screen.getAllByRole("checkbox").filter((node) => node.tagName === "INPUT");

    await user.click(screen.getByRole("button", { name: "Select all" }));
    inputs.forEach((input) => expect(input).toBeChecked());
    await user.click(screen.getByRole("button", { name: "Clear selection" }));
    inputs.forEach((input) => expect(input).not.toBeChecked());
    await user.click(inputs[0]);
    await user.click(screen.getByRole("button", { name: "Invert selection" }));
    expect(inputs[0]).not.toBeChecked();
    expect(inputs[1]).toBeChecked();
    expect(inputs[2]).toBeChecked();
  });
});

function CardHarness() {
  const [selected, setSelected] = useState(false);
  return (
    <ExtractPageCard
      pdf={{ numPages: 12 } as never}
      index={2}
      pageCount={12}
      selected={selected}
      onToggle={() => setSelected((value) => !value)}
    />
  );
}

describe("ExtractPageCard", () => {
  it("shows the slash label and toggles when the card is clicked", async () => {
    const user = userEvent.setup();
    render(<CardHarness />);
    const label = screen.getByText("3 / 12");
    const card = label.closest('[role="checkbox"]');
    expect(card).toHaveAttribute("aria-checked", "false");
    await user.click(label);
    expect(card).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("thumbnail-2")).toBeInTheDocument();
  });
});
