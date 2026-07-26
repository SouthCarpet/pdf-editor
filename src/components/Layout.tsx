import { type ReactNode } from "react";
import { TopBar } from "./TopBar";
import { ThemeProvider } from "./ThemeProvider";
import { SessionRestorePrompt } from "./SessionRestorePrompt";
import { Onboarding } from "./Onboarding";
import { DocumentTabs } from "./opening/DocumentTabs";
import { OpenFilesProvider } from "./opening/OpenFilesProvider";

export function Layout({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <OpenFilesProvider>
        <div className="flex h-screen min-h-0 flex-col">
          <TopBar />
          <DocumentTabs />
          <SessionRestorePrompt />
          <Onboarding />
          <main className="min-h-0 flex-1 overflow-auto p-6">{children}</main>
        </div>
      </OpenFilesProvider>
    </ThemeProvider>
  );
}
