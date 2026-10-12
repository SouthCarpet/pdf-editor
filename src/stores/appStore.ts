import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "light" | "dark" | "system";
export type Language = "sk" | "en";

/** Same value as `ZOOM_DEFAULT` in workspaceStore (1 = 100%). Kept as a
 * literal here so this persist store does not import the workspace store. */
const DEFAULT_ZOOM = 1;

/** Settings-page zoom choices. The workspace zoom control itself steps by
 * `ZOOM_STEP` (10 points); this list is the T4.2 percent set. */
export const DEFAULT_ZOOM_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

interface AppState {
  theme: Theme;
  language: Language;
  defaultSaveFolder: string | null;
  defaultZoom: number;
  openLastDocumentAtStart: boolean;
  /** Seconds between dirty autosaves of pending fills. T4.3. */
  autosaveIntervalSec: number;
  setTheme: (t: Theme) => void;
  setLanguage: (l: Language) => void;
  setDefaultSaveFolder: (folder: string | null) => void;
  setDefaultZoom: (z: number) => void;
  setOpenLastDocumentAtStart: (on: boolean) => void;
  setAutosaveIntervalSec: (sec: number) => void;
}

/** Plan 119 removed the "strict privacy" switch: it never gated a network
 * path, and the update consent in About is the only network control. An
 * old blob still carries `privacyStrict`; drop it so it is not stored again. */
function withoutRetiredKeys(persisted: unknown): Partial<AppState> {
  const rest: Record<string, unknown> = { ...(persisted as Record<string, unknown> | undefined) };
  delete rest.privacyStrict;
  return rest as Partial<AppState>;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      theme: "system",
      language: "en",
      defaultSaveFolder: null,
      defaultZoom: DEFAULT_ZOOM,
      openLastDocumentAtStart: false,
      autosaveIntervalSec: 10,
      setTheme: (t) => set({ theme: t }),
      setLanguage: (l) => set({ language: l }),
      setDefaultSaveFolder: (folder) => set({ defaultSaveFolder: folder }),
      setDefaultZoom: (z) => set({ defaultZoom: z }),
      setOpenLastDocumentAtStart: (on) => set({ openLastDocumentAtStart: on }),
      setAutosaveIntervalSec: (sec) => set({ autosaveIntervalSec: sec }),
    }),
    {
      name: "pdf-editor-app",
      // Shallow merge, not migrate: an old blob missing the T4.2 / T4.3
      // fields keeps those keys from current-state defaults.
      merge: (persisted, current) => ({
        ...current,
        ...withoutRetiredKeys(persisted),
      }),
    },
  ),
);
