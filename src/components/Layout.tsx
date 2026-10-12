import { type ReactNode, useEffect } from "react";
import { TopBar } from "./TopBar";
import { ThemeProvider } from "./ThemeProvider";
import { SessionRestorePrompt } from "./SessionRestorePrompt";
import { Onboarding } from "./Onboarding";
import { CloseGuardDialog } from "./CloseGuardDialog";
import { DocumentTabs } from "./opening/DocumentTabs";
import { OpenFilesProvider } from "./opening/OpenFilesProvider";
import { useUpdateStore } from "@/stores/updateStore";
import { PrintShortcutStatus } from "./workspace/PrintShortcutStatus";

export function Layout({ children }: { children: ReactNode }) {
  const checkForUpdate = useUpdateStore((state) => state.check);

  // Gated by the stored consent in the store and again in the backend.
  // A start check is silent: it only puts a dot on the Settings button.
  useEffect(() => {
    void checkForUpdate("start");
  }, [checkForUpdate]);

  return (
    <ThemeProvider>
      <OpenFilesProvider>
        <div className="flex h-screen min-h-0 flex-col">
          <TopBar />
          <DocumentTabs />
          <SessionRestorePrompt />
          <Onboarding />
          <CloseGuardDialog />
          <PrintShortcutStatus />
          <main className="min-h-0 flex-1 overflow-auto p-6">{children}</main>
        </div>
      </OpenFilesProvider>
    </ThemeProvider>
  );
}
