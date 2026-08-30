import { createContext, useContext } from "react";
import type { OpenPathsResult } from "./openPaths";

export interface OpenFilesContextValue {
  browseForPdfs: () => Promise<void>;
  openPaths: (paths: string[]) => Promise<OpenPathsResult>;
}

export const OpenFilesContext = createContext<OpenFilesContextValue | null>(null);

const unavailableOpening: OpenFilesContextValue = {
  browseForPdfs: async () => {},
  openPaths: async () => ({ opened: 0, failed: 0, ignored: 0, focusedPath: null }),
};

export function useOpenFiles(): OpenFilesContextValue {
  return useContext(OpenFilesContext) ?? unavailableOpening;
}
