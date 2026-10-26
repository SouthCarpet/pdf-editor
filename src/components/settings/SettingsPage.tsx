import { useTranslation } from "react-i18next";
import { BuildInfoSettings } from "./BuildInfoSettings";
import { GeneralSettings } from "./GeneralSettings";
import { OcrLanguagesSettings } from "./OcrLanguagesSettings";
import { SavingOpeningSettings } from "./SavingOpeningSettings";

/** Settings: Appearance first, About last (Kaliber shell core). */
export function SettingsPage() {
  const { t } = useTranslation("settings");

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="k-pagehead">
        <h1 className="k-pagehead-title text-balance">{t("title")}</h1>
      </div>
      <GeneralSettings />
      <SavingOpeningSettings />
      <OcrLanguagesSettings />
      <BuildInfoSettings />
    </div>
  );
}
