import { type ReactNode, useCallback, useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { TopBar } from "./TopBar";
import { ThemeProvider } from "./ThemeProvider";
import { SessionRestorePrompt } from "./SessionRestorePrompt";
import { Onboarding } from "./Onboarding";
import { CloseGuardDialog } from "./CloseGuardDialog";
import { DocumentTabs } from "./opening/DocumentTabs";
import { OpenFilesProvider } from "./opening/OpenFilesProvider";
import { AppFooter } from "./shell/AppFooter";
import { HelpPanel } from "./shell/HelpPanel";
import { replayTour } from "./shell/tour";
import { useShellKeys } from "./shell/useShellKeys";
import { useUpdateStore } from "@/stores/updateStore";
import { PrintShortcutStatus } from "./workspace/PrintShortcutStatus";

export function Layout({ children }: { children: ReactNode }) {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const checkForUpdate = useUpdateStore((state) => state.check);
  const [helpOpen, setHelpOpen] = useState(false);

  // Gated by the stored consent in the store and again in the backend.
  // A start check is silent: it only shows the quiet update line in the header.
  useEffect(() => {
    void checkForUpdate("start");
  }, [checkForUpdate]);

  const toggleHelp = useCallback(() => setHelpOpen((open) => !open), []);
  const openSettings = useCallback(() => void navigate({ to: "/settings" }), [navigate]);
  useShellKeys(toggleHelp, openSettings);

  const showTour = () => {
    setHelpOpen(false);
    void navigate({ to: "/" }).then(() => replayTour(t));
  };

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
          <AppFooter onOpenHelp={toggleHelp} />
          <HelpPanel open={helpOpen} onOpenChange={setHelpOpen} onShowTour={showTour} />
        </div>
      </OpenFilesProvider>
    </ThemeProvider>
  );
}
