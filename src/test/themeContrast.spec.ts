import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src/styles/globals.css"), "utf8");

function themeBlock(selector: "@theme" | ".dark"): string {
  const match = css.match(
    new RegExp(`${selector === ".dark" ? "\\.dark" : "@theme"}\\s*\\{([\\s\\S]*?)\\n\\}`),
  );
  if (!match) throw new Error(`Missing ${selector} theme block`);
  return match[1];
}

function themeColors(selector: "@theme" | ".dark"): Record<string, string> {
  return Object.fromEntries(
    [...themeBlock(selector).matchAll(/--color-([\w-]+):\s*(#[\da-f]{6});/gi)].map(
      ([, name, value]) => [name, value],
    ),
  );
}

function luminance(hex: string): number {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)!
    .map((value) => Number.parseInt(value, 16) / 255)
    .map((value) =>
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
    );
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
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
  ["control-foreground", "control"],
  ["placeholder", "control"],
  ["accent-foreground", "accent"],
  ["accent-soft-foreground", "accent-soft"],
  ["danger-foreground", "danger"],
  ["danger-soft-foreground", "danger-soft"],
  ["foreground", "dropzone"],
  ["placeholder", "dropzone"],
] as const;

describe.each([
  ["light", "@theme" as const],
  ["dark", ".dark" as const],
])("%s theme contrast", (_name, selector) => {
  const colors = themeColors(selector);

  it.each(requiredPairs)("%s on %s meets WCAG AA", (foreground, background) => {
    expect(colors[foreground], `${foreground} token`).toBeDefined();
    expect(colors[background], `${background} token`).toBeDefined();
    expect(contrast(colors[foreground], colors[background])).toBeGreaterThanOrEqual(4.5);
  });
});
