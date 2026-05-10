import { type ReactNode } from "react";
import { TopBar } from "./TopBar";
import { ThemeProvider } from "./ThemeProvider";

export function Layout({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <div className="flex min-h-screen flex-col">
        <TopBar />
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </ThemeProvider>
  );
}
