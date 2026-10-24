import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider, applyTheme, readStoredTheme, useTheme } from "../ThemeProvider";

function stubSystemDark(dark: boolean) {
  vi.stubGlobal("matchMedia", () => ({
    matches: dark,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.className = "";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readStoredTheme", () => {
  it("returns system when nothing is saved", () => {
    expect(readStoredTheme()).toBe("system");
  });

  it("reads the Kaliber key", () => {
    localStorage.setItem("kaliber-theme", "dark");
    expect(readStoredTheme()).toBe("dark");
  });

  it("moves a fixed choice from the old key to the new key once", () => {
    localStorage.setItem("theme", "dark");
    expect(readStoredTheme()).toBe("dark");
    expect(localStorage.getItem("kaliber-theme")).toBe("dark");
    expect(localStorage.getItem("theme")).toBeNull();
  });

  it("drops an old system choice without writing the new key", () => {
    localStorage.setItem("theme", "system");
    expect(readStoredTheme()).toBe("system");
    expect(localStorage.getItem("kaliber-theme")).toBeNull();
    expect(localStorage.getItem("theme")).toBeNull();
  });

  it("prefers the new key over the old one", () => {
    localStorage.setItem("kaliber-theme", "light");
    localStorage.setItem("theme", "dark");
    expect(readStoredTheme()).toBe("light");
  });
});

describe("applyTheme", () => {
  it("sets the data-theme attribute and the class together", () => {
    stubSystemDark(false);
    applyTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement).toHaveClass("dark");
    expect(document.documentElement).not.toHaveClass("light");
  });

  it("resolves system through the media query", () => {
    stubSystemDark(true);
    applyTheme("system");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});

describe("ThemeProvider", () => {
  function Probe() {
    const { theme, setTheme } = useTheme();
    return (
      <button type="button" onClick={() => setTheme("system")}>
        {theme}
      </button>
    );
  }

  it("removes the saved key when the user picks system", () => {
    stubSystemDark(false);
    localStorage.setItem("kaliber-theme", "dark");
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(document.documentElement.dataset.theme).toBe("dark");
    act(() => screen.getByRole("button", { name: "dark" }).click());
    expect(localStorage.getItem("kaliber-theme")).toBeNull();
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
