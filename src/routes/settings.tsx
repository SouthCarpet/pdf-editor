import { createFileRoute } from "@tanstack/react-router";

// Stub for Task 42 (TopBar needs `/settings` to typecheck); replaced by Task 44
// with the full GeneralSettings panel (theme, language, privacy).
export const Route = createFileRoute("/settings")({
  component: () => (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-bold">Settings</h1>
    </div>
  ),
});
