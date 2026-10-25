// Oracle: plan 119 K8. Everything drawn on the PDF page uses the light look,
// in both themes. App chrome keeps the theme.
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it } from "vitest";
import { render, renderHook } from "@testing-library/react";
import type { PageViewport } from "pdfjs-dist";
import { OwnFieldHandles } from "../OwnFieldHandles";
import { useCanvasColors } from "../useCanvasColors";
import type { ClientAnnotation } from "@/stores/annotationsStore";

const css = ["../../../styles/tokens.css", "../workspace.css"]
  .map((file) => readFileSync(new URL(file, import.meta.url), "utf8")).join("\n");

beforeEach(() => {
  const style = document.createElement("style");
  style.dataset.test = "paper";
  style.textContent = css;
  document.head.append(style);
});
afterEach(() => {
  document.head.querySelectorAll("style[data-test]").forEach((node) => node.remove());
  document.documentElement.removeAttribute("data-theme");
});

function colorsIn(theme: "light" | "dark") {
  document.documentElement.dataset.theme = theme;
  const { result, unmount } = renderHook(() => useCanvasColors());
  const colors = result.current;
  unmount();
  return colors;
}

it("returns the light canvas colours when the root theme is dark", () => {
  const light = colorsIn("light");
  expect(light.accent).not.toBe("#555");
  expect(colorsIn("dark")).toEqual(light);
});

const viewport = { scale: 1, convertToViewportRectangle: () => [10, 10, 150, 32] } as unknown as PageViewport;
const field: ClientAnnotation = {
  type: "form_field", page: 0, rect: [10, 10, 150, 32], name: "Name",
  kind: "text", multiline: false, font_size: 12, __clientId: "pending",
};

it("resolves own-field handle colours to the light values inside the sheet in a dark theme", () => {
  document.documentElement.dataset.theme = "light";
  const lightProbe = document.createElement("i");
  document.body.append(lightProbe);
  const light = getComputedStyle(lightProbe).getPropertyValue("--color-accent").trim();
  const lightRaised = getComputedStyle(lightProbe).getPropertyValue("--color-surface-raised").trim();
  document.documentElement.dataset.theme = "dark";
  const { container } = render(
    <div data-testid="sheet" className="paper-light">
      <OwnFieldHandles viewport={viewport} field={field} onRectChange={() => { }} />
    </div>);
  const handle = container.querySelector("button")!;
  const style = getComputedStyle(handle);
  expect(light).not.toBe("");
  expect(style.getPropertyValue("--color-accent").trim()).toBe(light);
  expect(style.getPropertyValue("--color-surface-raised").trim()).toBe(lightRaised);
});

it("keeps the dark values for chrome outside the sheet", () => {
  document.documentElement.dataset.theme = "dark";
  const chrome = document.createElement("div");
  const sheet = document.createElement("div");
  sheet.className = "paper-light";
  document.body.append(chrome, sheet);
  const outside = getComputedStyle(chrome).getPropertyValue("--color-accent").trim();
  const inside = getComputedStyle(sheet).getPropertyValue("--color-accent").trim();
  expect(outside).toBe("oklch(0.76 0.1 235)");
  expect(inside).toBe("oklch(0.43 0.09 235)");
});

it("keeps the paper scope equal to the light root tokens", () => {
  const block = (selector: string) =>
    css.slice(css.indexOf(selector)).match(/\{([^}]*)\}/)![1];
  const declared = (text: string) =>
    new Map([...text.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
  const root = declared(block(":root {"));
  const paper = declared(block(".paper-light {"));
  expect(paper.size).toBeGreaterThan(5);
  for (const [name, value] of paper) expect(root.get(name), name).toBe(value);
});
