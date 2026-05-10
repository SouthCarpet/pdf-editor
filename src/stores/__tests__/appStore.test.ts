import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "../appStore";

describe("appStore", () => {
  beforeEach(() => {
    useAppStore.setState({ theme: "system", language: "en", privacyStrict: true });
  });

  it("toggles theme", () => {
    useAppStore.getState().setTheme("dark");
    expect(useAppStore.getState().theme).toBe("dark");
  });

  it("changes language", () => {
    useAppStore.getState().setLanguage("sk");
    expect(useAppStore.getState().language).toBe("sk");
  });

  it("toggles privacy", () => {
    useAppStore.getState().setPrivacy(false);
    expect(useAppStore.getState().privacyStrict).toBe(false);
  });
});
