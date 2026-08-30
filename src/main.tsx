import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { queryClient } from "./tauri/queryClient";
import { installCrashHandlers } from "@/lib/crashHandler";
import { Toaster } from "@/components/ui/toaster";
import "./i18n";
import "./styles/globals.css";

// Delta P: install JS-side error handlers before any provider wraps the
// tree. They forward window.onerror / unhandledrejection to the Rust
// crash logger so a single logs directory contains the full incident
// timeline. installCrashHandlers() is idempotent.
installCrashHandlers();

const router = createRouter({ routeTree });
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  </React.StrictMode>
);
