import { createFileRoute } from "@tanstack/react-router";
import { GeneralSettings } from "@/components/settings/GeneralSettings";

export const Route = createFileRoute("/settings")({
  component: () => (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-bold">Settings</h1>
      <GeneralSettings />
    </div>
  ),
});
