import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileDropzone } from "@/components/FileDropzone";
import { GeneralSettings } from "@/components/settings/GeneralSettings";

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

describe("dark theme token coverage", () => {
  // Oracle: 119-K5 finding 2. App field fills must not replace Kaliber's
  // mid-grey control edge, or unchecked switches disappear in both themes.
  it("preserves the shared control edge instead of aliasing it to a field fill", () => {
    const css = readFileSync(join(process.cwd(), "src/styles/globals.css"), "utf8");
    expect(css).not.toMatch(/--color-control\s*:/);
  });

  it("renders shared controls and the drop surface with semantic token classes", () => {
    document.documentElement.classList.add("dark");
    render(
      <>
        <Button variant="outline">Browse</Button>
        <Input aria-label="Name" placeholder="Document name" />
        <FileDropzone onFiles={() => {}} />
      </>,
    );

    // Kaliber r4 (plan 119 K2): the shared controls take their colours from
    // the `.k-*` classes, which read the theme tokens; they carry no colour
    // class of their own.
    expect(screen.getByRole("button", { name: "Browse" })).toHaveClass("k-btn", "k-btn-secondary");
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveClass(
      "k-input",
      "placeholder:text-[var(--color-text-muted)]",
    );
    // Located by test id, not by copy: this test is about theme tokens, and
    // it broke the moment the placeholder went through t() (plan 029), which
    // is a copy change that says nothing about theming.
    const placeholder = screen.getByTestId("dropzone-placeholder");
    // The drop surface is the Kaliber .k-drop-zone: its colours come from the
    // tokens in kaliber.css, so the theme switch reaches it with no own class.
    expect(placeholder).toHaveClass("k-drop-hint");
    expect(placeholder.parentElement).toHaveClass("k-drop-zone");
  });

  it("keeps native selects on themed surfaces under the dark root class", () => {
    document.documentElement.classList.add("dark");
    render(<GeneralSettings />);

    for (const select of screen.getAllByRole("combobox")) {
      expect(select.className).toContain("k-select");
      expect(select.className).not.toMatch(/\bbg-white\b|\btext-black\b/);
    }
  });

  it("defines custom select, placeholder, focus, and autofill theme rules", () => {
    const css = readFileSync(
      join(process.cwd(), "src/styles/globals.css"),
      "utf8",
    );

    expect(css).toMatch(/select\s*\{[\s\S]*appearance:\s*none/);
    expect(css).toMatch(/background-image:\s*var\(--select-chevron\)/);
    expect(css).toMatch(/input::placeholder[\s\S]*--color-placeholder/);
    expect(css).toMatch(/input:-webkit-autofill[\s\S]*var\(--color-field-surface\) inset/);
    expect(css).toMatch(/html\.dark\s*\{[\s\S]*color-scheme:\s*dark/);
  });

  it("has no literal light-only background utilities in product TSX", () => {
    const files = walkTsx(join(process.cwd(), "src"));
    const violations = files.flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return [
        ...source.matchAll(
          /\bbg-(?:white\b|(?:neutral|blue|red|green|emerald|amber|yellow)-\S*)/g,
        ),
      ].map(
        (match) =>
          `${file}:${source.slice(0, match.index).split("\n").length}`,
      );
    });

    expect(violations).toEqual([]);
  });
});

function walkTsx(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return walkTsx(path);
    return entry.name.endsWith(".tsx") ? [path] : [];
  });
}
