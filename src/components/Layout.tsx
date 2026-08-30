import { type ReactNode, useEffect } from "react";
import { TopBar } from "./TopBar";
import { ThemeProvider } from "./ThemeProvider";
import { SessionRestorePrompt } from "./SessionRestorePrompt";
import { Onboarding } from "./Onboarding";
import { CloseGuardDialog } from "./CloseGuardDialog";
import { DocumentTabs } from "./opening/DocumentTabs";
import { OpenFilesProvider } from "./opening/OpenFilesProvider";
import { UpdateNotice } from "./UpdateNotice";
import { useUpdateStore } from "@/stores/updateStore";
import { PrintShortcutStatus } from "./workspace/PrintShortcutStatus";

export function Layout({ children }: { children: ReactNode }) {
  const checkForUpdate = useUpdateStore((state) => state.check);

  useEffect(() => {
    void checkForUpdate();
  }, [checkForUpdate]);

  return (
    <ThemeProvider>
      <OpenFilesProvider>
        <div className="flex h-screen min-h-0 flex-col">
          <TopBar />
          <UpdateNotice />
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
