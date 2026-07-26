import { createContext, useContext } from "react";

export interface OpenFilesContextValue {
  browseForPdfs: () => Promise<void>;
  requestOpen: (paths: string[]) => void;
}

export const OpenFilesContext = createContext<OpenFilesContextValue | null>(null);

const unavailableOpening: OpenFilesContextValue = {
  browseForPdfs: async () => {},
  requestOpen: () => {},
};

export function useOpenFiles(): OpenFilesContextValue {
  return useContext(OpenFilesContext) ?? unavailableOpening;
}
