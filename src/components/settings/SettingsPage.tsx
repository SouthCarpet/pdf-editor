import { useTranslation } from "react-i18next";
import { BuildInfoSettings } from "./BuildInfoSettings";
import { GeneralSettings } from "./GeneralSettings";
import { OcrLanguagesSettings } from "./OcrLanguagesSettings";

export function SettingsPage() {
  const { t } = useTranslation("settings");

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-6">
      <h1 className="text-2xl font-bold text-balance">{t("title")}</h1>
      <GeneralSettings />
      <BuildInfoSettings />
      <OcrLanguagesSettings />
    </div>
  );
}
