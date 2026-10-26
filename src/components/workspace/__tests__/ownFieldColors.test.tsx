// Oracle: K4 carried finding E. Pending and saved own fields use accent-soft
// with its paired foreground in both themes, including after a theme change.
import type { ReactNode } from "react";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
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

const css = ["../../../styles/tokens.css", "../workspace.css"]
  .map((file) => readFileSync(new URL(file, import.meta.url), "utf8")).join("\n");
const LIGHT_SOFT = "oklch(0.92 0.03 235)";
const LIGHT_FOREGROUND = "oklch(0.32 0.07 235)";

beforeEach(() => {
  const style = document.createElement("style");
  style.dataset.test = "colors";
  style.textContent = css;
  document.head.append(style);
});
afterEach(() => {
  document.head.querySelectorAll("style[data-test]").forEach((node) => node.remove());
  document.documentElement.removeAttribute("data-theme");
});

it.each(["light", "dark"])("keeps pending and saved own-field boxes on the light paper look in %s", (theme) => {
  document.documentElement.dataset.theme = theme;
  nodes.boxes.length = 0;
  nodes.labels.length = 0;
  render(<PendingOwnFieldLayer page={0} viewport={viewport}
    annotations={[field, { ...field, __clientId: "saved", __replaces: { object: 12, generation: 0 } }]}
    selectedId={null} onSelect={() => { }} onRectChange={() => { }} />);
  expect(nodes.boxes).toEqual([LIGHT_SOFT, LIGHT_SOFT]);
  expect(nodes.labels).toEqual([LIGHT_FOREGROUND, LIGHT_FOREGROUND]);
});

it("keeps own-field labels and fills light when the theme changes", async () => {
  render(<PendingOwnFieldLayer page={0} viewport={viewport} annotations={[field]}
    selectedId={null} onSelect={() => { }} onRectChange={() => { }} />);
  await act(async () => { document.documentElement.dataset.theme = "dark"; });
  expect(nodes.boxes.at(-1)).toBe(LIGHT_SOFT);
  expect(nodes.labels.at(-1)).toBe(LIGHT_FOREGROUND);
});
