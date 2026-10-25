// Oracle: K4 carried finding E. Pending and saved own fields use accent-soft
// with its paired foreground in both themes, including after a theme change.
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import type { PageViewport } from "pdfjs-dist";
import type { ClientAnnotation } from "@/stores/annotationsStore";

const nodes = vi.hoisted(() => ({ boxes: [] as string[], labels: [] as string[] }));
vi.mock("react-konva", () => ({
  Group: ({ children }: { children: ReactNode }) => <>{children}</>,
  Rect: ({ fill }: { fill: string }) => { nodes.boxes.push(fill); return null; },
  Text: ({ fill }: { fill: string }) => { nodes.labels.push(fill); return null; },
}));
import { PendingOwnFieldLayer } from "../PendingOwnFieldLayer";

const viewport = {
  scale: 1,
  convertToViewportRectangle: () => [10, 10, 150, 32],
} as unknown as PageViewport;
const field: ClientAnnotation = {
  type: "form_field", page: 0, rect: [10, 10, 150, 32], name: "Name",
  kind: "text", multiline: false, font_size: 12, __clientId: "pending",
};

afterEach(() => {
  document.documentElement.removeAttribute("style");
  document.documentElement.removeAttribute("data-theme");
});

it.each([
  ["light", "rgb(225, 240, 249)", "rgb(15, 55, 75)"],
  ["dark", "rgb(20, 42, 55)", "rgb(190, 225, 245)"],
])("keeps pending and saved own-field boxes readable in %s", (theme, soft, foreground) => {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.setProperty("--color-accent-soft", soft);
  document.documentElement.style.setProperty("--color-accent-soft-foreground", foreground);
  nodes.boxes.length = 0;
  nodes.labels.length = 0;
  render(<PendingOwnFieldLayer page={0} viewport={viewport}
    annotations={[field, { ...field, __clientId: "saved", __replaces: { object: 12, generation: 0 } }]}
    selectedId={null} onSelect={() => { }} onRectChange={() => { }} />);
  expect(nodes.boxes).toEqual([soft, soft]);
  expect(nodes.labels).toEqual([foreground, foreground]);
});

it("updates own-field labels and fills when the theme changes", async () => {
  render(<PendingOwnFieldLayer page={0} viewport={viewport} annotations={[field]}
    selectedId={null} onSelect={() => { }} onRectChange={() => { }} />);
  await act(async () => {
    document.documentElement.style.setProperty("--color-accent-soft", "rgb(20, 42, 55)");
    document.documentElement.style.setProperty("--color-accent-soft-foreground", "rgb(190, 225, 245)");
    document.documentElement.dataset.theme = "dark";
  });
  expect(nodes.boxes.at(-1)).toBe("rgb(20, 42, 55)");
  expect(nodes.labels.at(-1)).toBe("rgb(190, 225, 245)");
});
