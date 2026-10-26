import { describe, it, expect, beforeEach } from "vitest";
import { ZOOM_DEFAULT } from "../workspaceStore";
import { useAppStore } from "../appStore";

const STORE_KEY = "pdf-editor-app";

function resetAppStore() {
  localStorage.removeItem(STORE_KEY);
  useAppStore.setState({
    language: "en",
    defaultSaveFolder: null,
    defaultZoom: ZOOM_DEFAULT,
    openLastDocumentAtStart: false,
    autosaveIntervalSec: 10,
  });
}

describe("appStore", () => {
  beforeEach(() => {
    resetAppStore();
  });

  it("keeps no theme copy: ThemeProvider owns the theme", () => {
    expect(useAppStore.getState()).not.toHaveProperty("theme");
    expect(useAppStore.getState()).not.toHaveProperty("setTheme");
  });

  it("changes language", () => {
    useAppStore.getState().setLanguage("sk");
    expect(useAppStore.getState().language).toBe("sk");
  });

  it("defaults defaultSaveFolder to null, defaultZoom to ZOOM_DEFAULT, and openLastDocumentAtStart to false", () => {
    expect(useAppStore.getState().defaultSaveFolder).toBeNull();
    expect(useAppStore.getState().defaultZoom).toBe(ZOOM_DEFAULT);
    expect(useAppStore.getState().openLastDocumentAtStart).toBe(false);
  });

  it("setters write the new save-folder, zoom, and open-last fields", () => {
    useAppStore.getState().setDefaultSaveFolder("D:\\filled");
    useAppStore.getState().setDefaultZoom(1.5);
    useAppStore.getState().setOpenLastDocumentAtStart(true);

    expect(useAppStore.getState().defaultSaveFolder).toBe("D:\\filled");
    expect(useAppStore.getState().defaultZoom).toBe(1.5);
    expect(useAppStore.getState().openLastDocumentAtStart).toBe(true);

    useAppStore.getState().setDefaultSaveFolder(null);
    expect(useAppStore.getState().defaultSaveFolder).toBeNull();
  });

  it("hydrates an old persisted blob without the new fields with the defaults (persist merge, not migrate)", async () => {
    // Oracle: zustand persist default/explicit merge is `{...current, ...persisted}`.
    // An old blob that only stored theme/language keeps language, drops the
    // retired theme copy and picks up the new fields from current-state defaults.
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({
        state: { theme: "dark", language: "sk" },
        version: 0,
      }),
    );

    await useAppStore.persist.rehydrate();

    expect(useAppStore.getState()).not.toHaveProperty("theme");
    expect(useAppStore.getState().language).toBe("sk");
    expect(useAppStore.getState().defaultSaveFolder).toBeNull();
    expect(useAppStore.getState().defaultZoom).toBe(ZOOM_DEFAULT);
    expect(useAppStore.getState().openLastDocumentAtStart).toBe(false);
    expect(useAppStore.getState().autosaveIntervalSec).toBe(10);
  });

  it("drops the retired privacyStrict key from an old blob (plan 119)", async () => {
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({ state: { theme: "dark", privacyStrict: true }, version: 0 }),
    );

    await useAppStore.persist.rehydrate();
    useAppStore.getState().setLanguage("sk");

    expect(useAppStore.getState()).not.toHaveProperty("privacyStrict");
    expect(useAppStore.getState()).not.toHaveProperty("theme");
    const stored = JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}").state;
    expect(stored).not.toHaveProperty("privacyStrict");
    expect(stored).not.toHaveProperty("theme");
  });

  it("defaults autosaveIntervalSec to 10 and the setter writes it", () => {
    expect(useAppStore.getState().autosaveIntervalSec).toBe(10);
    useAppStore.getState().setAutosaveIntervalSec(30);
    expect(useAppStore.getState().autosaveIntervalSec).toBe(30);
  });
});
