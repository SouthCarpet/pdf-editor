import { createFileRoute } from "@tanstack/react-router";
import { GeneralSettings } from "@/components/settings/GeneralSettings";
import { OcrLanguagesSettings } from "@/components/settings/OcrLanguagesSettings";

export const Route = createFileRoute("/settings")({
  component: () => (
    <div className="mx-auto max-w-2xl space-y-8 p-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <GeneralSettings />
      <OcrLanguagesSettings />
    </div>
  ),
});
