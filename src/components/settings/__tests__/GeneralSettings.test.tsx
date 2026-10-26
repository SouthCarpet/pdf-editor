import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import { ThemeProvider } from "@/components/ThemeProvider";
import { useAppStore } from "@/stores/appStore";
import { GeneralSettings } from "../GeneralSettings";

function renderSettings() {
  return render(
    <ThemeProvider>
      <GeneralSettings />
    </ThemeProvider>,
  );
}

beforeEach(async () => {
  localStorage.clear();
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  await i18n.changeLanguage("en");
  useAppStore.setState({ language: "en" });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GeneralSettings (Appearance)", () => {
  it("offers Light, Dark and System as one segmented group, System selected by default", () => {
    renderSettings();
    const group = screen.getByRole("radiogroup", { name: "Theme" });
    const radios = within(group).getAllByRole("radio");
    expect(radios.map((radio) => (radio as HTMLInputElement).value)).toEqual([
      "light",
      "dark",
      "system",
    ]);
    expect(screen.getByRole("radio", { name: "System" })).toBeChecked();
  });

  it("writes the choice to kaliber-theme and clears it for System", async () => {
    renderSettings();

    await userEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(localStorage.getItem("kaliber-theme")).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");

    await userEvent.click(screen.getByRole("radio", { name: "System" }));
    expect(localStorage.getItem("kaliber-theme")).toBeNull();
  });

  it("keeps no second theme copy in the app store blob", async () => {
    renderSettings();
    await userEvent.click(screen.getByRole("radio", { name: "Light" }));
    const blob = JSON.parse(localStorage.getItem("pdf-editor-app") ?? "{}");
    expect(blob.state ?? {}).not.toHaveProperty("theme");
  });

  it("changes the language", async () => {
    renderSettings();
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Language" }), "sk");
    expect(useAppStore.getState().language).toBe("sk");
  });
});
