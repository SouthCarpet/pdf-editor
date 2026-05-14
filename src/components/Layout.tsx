import { type ReactNode } from "react";
import { TopBar } from "./TopBar";
import { ThemeProvider } from "./ThemeProvider";
import { SessionRestorePrompt } from "./SessionRestorePrompt";
import { Onboarding } from "./Onboarding";

export function Layout({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <div className="flex min-h-screen flex-col">
        <TopBar />
        <SessionRestorePrompt />
        <Onboarding />
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </ThemeProvider>
  );
}
