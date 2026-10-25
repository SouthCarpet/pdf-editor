import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// WCAG AA for the semantic colour pairs the screens still read by their
// pre-r4 names. The values come from the files the browser loads:
// `tokens.css` (Kaliber, oklch) and the alias block of `globals.css`.
// Each theme resolves like the cascade does: root first, then the dark block.

const read = (file: string) => readFileSync(join(process.cwd(), "src/styles", file), "utf8");
const tokensCss = read("tokens.css");
const globalsCss = read("globals.css");

type Vars = Record<string, string>;

function block(css: string, selector: string): Vars {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`Missing ${selector} block`);
  const end = css.indexOf("\n}", start);
  const body = css.slice(start, end);
  return Object.fromEntries(
    [...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]),
  );
}

function themeVars(theme: "light" | "dark"): Vars {
  // File order is the cascade order: tokens root, tokens dark, then the aliases.
  const dark = theme === "dark" ? block(tokensCss, '[data-theme="dark"]') : {};
  const aliasDark = theme === "dark" ? block(globalsCss, '[data-theme="dark"]') : {};
  return { ...block(tokensCss, ":root"), ...dark, ...block(globalsCss, ":root"), ...aliasDark };
}

function resolve(vars: Vars, name: string): string {
  const value = vars[`--color-${name}`];
  if (value === undefined) throw new Error(`No token --color-${name}`);
  const alias = value.match(/^var\(--color-([\w-]+)\)$/);
  return alias ? resolve(vars, alias[1]) : value;
}

/** oklch(L C H) to linear sRGB, clipped to the gamut. */
function oklchToLinear(value: string): [number, number, number] {
  const match = value.match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/);
  if (!match) throw new Error(`Not a plain oklch() colour: ${value}`);
  const [l, c, h] = [Number(match[1]), Number(match[2]), (Number(match[3]) * Math.PI) / 180];
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
  return rgb.map((channel) => Math.min(1, Math.max(0, channel))) as [number, number, number];
}

function luminance(value: string): number {
  const [r, g, b] = oklchToLinear(value);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground: string, background: string): number {
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

const requiredPairs = [
  ["foreground", "background"],
  ["muted", "background"],
  ["foreground", "card"],
  ["muted", "card"],
  ["control-foreground", "field-surface"],
  ["placeholder", "field-surface"],
  ["accent-foreground", "accent"],
  ["accent-soft-foreground", "accent-soft"],
  ["danger-foreground", "danger"],
  ["danger-text", "background"],
  ["danger-soft-foreground", "danger-soft"],
  ["warning-text", "background"],
  ["warning-text", "card"],
  ["warning-foreground", "warning"],
  ["warning-soft-foreground", "warning-soft"],
  ["success-text", "background"],
  ["success-soft-foreground", "success-soft"],
  ["foreground", "dropzone"],
  ["placeholder", "dropzone"],
] as const;

describe.each(["light", "dark"] as const)("%s theme contrast", (theme) => {
  const vars = themeVars(theme);

  it.each(requiredPairs)("%s on %s meets WCAG AA", (foreground, background) => {
    const ratio = contrast(resolve(vars, foreground), resolve(vars, background));
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});
