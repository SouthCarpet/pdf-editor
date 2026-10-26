import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "@/components/ThemeProvider";
import i18n from "@/i18n";
import { ThemeSwitch } from "../ThemeSwitch";

function stubSystemDark(dark: boolean) {
  vi.stubGlobal("matchMedia", () => ({
    matches: dark,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

function renderSwitch() {
  return render(
    <ThemeProvider>
      <ThemeSwitch />
    </ThemeProvider>,
  );
}

beforeEach(async () => {
  localStorage.clear();
  await i18n.changeLanguage("en");
  document.documentElement.removeAttribute("data-theme");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ThemeSwitch", () => {
  it("is off for a light system and turns the app dark when clicked", async () => {
    stubSystemDark(false);
    renderSwitch();
    const toggle = screen.getByRole("switch", { name: "Dark theme" });
    expect(toggle).not.toBeChecked();

    await userEvent.click(toggle);

    expect(toggle).toBeChecked();
    expect(localStorage.getItem("kaliber-theme")).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("is on for a dark system and writes Light when clicked", async () => {
    stubSystemDark(true);
    renderSwitch();
    const toggle = screen.getByRole("switch", { name: "Dark theme" });
    expect(toggle).toBeChecked();

    await userEvent.click(toggle);

    expect(toggle).not.toBeChecked();
    expect(localStorage.getItem("kaliber-theme")).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("follows a saved choice over the system setting", () => {
    stubSystemDark(false);
    localStorage.setItem("kaliber-theme", "dark");
    renderSwitch();
    expect(screen.getByRole("switch", { name: "Dark theme" })).toBeChecked();
  });
});
