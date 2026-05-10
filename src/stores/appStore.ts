import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "light" | "dark" | "system";
export type Language = "sk" | "en";

interface AppState {
  theme: Theme;
  language: Language;
  privacyStrict: boolean;
  setTheme: (t: Theme) => void;
  setLanguage: (l: Language) => void;
  setPrivacy: (s: boolean) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      theme: "system",
      language: "en",
      privacyStrict: true,
      setTheme: (t) => set({ theme: t }),
      setLanguage: (l) => set({ language: l }),
      setPrivacy: (s) => set({ privacyStrict: s }),
    }),
    { name: "pdf-editor-app" },
  ),
);
