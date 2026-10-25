// Oracle: K4 focus rule and existing own-field geometry: 1 pt / Shift 10 pt,
// square checkboxes and page clamping. Handles must be reachable by Tab.
import { expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PageViewport } from "pdfjs-dist";
import type { ClientAnnotation } from "@/stores/annotationsStore";
import "@/i18n";
import { OwnFieldHandles } from "../OwnFieldHandles";

const viewport = {
  scale: 1, viewBox: [0, 0, 200, 200],
  convertToViewportRectangle: ([x0, y0, x1, y1]: number[]) => [x0, 200 - y0, x1, 200 - y1],
  convertToPdfPoint: (x: number, y: number) => [x, 200 - y],
} as unknown as PageViewport;
const field: ClientAnnotation = {
  type: "form_field", page: 0, rect: [10, 10, 150, 32], name: "Name",
  kind: "text", multiline: false, font_size: 12, __clientId: "own",
};

it("Tab reaches an own-field handle with a visible focus outline and arrows resize it", async () => {
  const user = userEvent.setup();
  const update = vi.fn();
  render(<OwnFieldHandles viewport={viewport} field={field} onRectChange={update} />);
  await user.tab();
  await user.tab();
  const right = screen.getByRole("button", { name: "Resize right edge of Name" });
  expect(right).toHaveFocus();
  expect(right.className).toContain("focus-visible:outline-[var(--color-focus)]");
  await user.keyboard("{ArrowRight}");
  expect(update).toHaveBeenLastCalledWith("own", [10, 10, 151, 32]);
  await user.keyboard("{Shift>}{ArrowRight}{/Shift}");
  expect(update).toHaveBeenLastCalledWith("own", [10, 10, 160, 32]);
});

it("keyboard resizing keeps checkboxes square", async () => {
  const user = userEvent.setup();
  const update = vi.fn();
  render(<OwnFieldHandles viewport={viewport} field={{ ...field, kind: "checkbox", rect: [10, 10, 24, 24] }} onRectChange={update} />);
  await user.tab();
  await user.tab();
  await user.keyboard("{ArrowRight}");
  expect(update).toHaveBeenLastCalledWith("own", [10, 10, 25, 25]);
});
