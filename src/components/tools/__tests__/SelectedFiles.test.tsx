import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/i18n";
import { SelectedFile, SelectedFiles } from "../SelectedFiles";

describe("SelectedFiles", () => {
  it("renders nothing for an empty list", () => {
    const { container } = render(<SelectedFiles files={[]} onRemove={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("removes the row by index, also when two paths are equal", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(<SelectedFiles files={["C:/a.pdf", "C:/b.pdf", "C:/a.pdf"]} onRemove={onRemove} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(3);
    await user.click(buttons[2]);
    expect(onRemove).toHaveBeenCalledWith(2);
  });

  it("shows one picked path as a plain ruled line, not a box", () => {
    render(<SelectedFile path="C:/only.pdf" />);
    const line = screen.getByText("C:/only.pdf");
    expect(line).toHaveAttribute("title", "C:/only.pdf");
    expect(line.className).not.toContain("rounded");
  });
});
