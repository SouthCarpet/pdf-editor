import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { DEFAULT_ZOOM_PRESETS, useAppStore } from "@/stores/appStore";
import { pickPaths } from "@/tauri/bridge";
import { SettingSwitch } from "./SettingSwitch";

export function SavingOpeningSettings() {
  const { t } = useTranslation("settings");
  const defaultSaveFolder = useAppStore((s) => s.defaultSaveFolder);
  const setDefaultSaveFolder = useAppStore((s) => s.setDefaultSaveFolder);
  const defaultZoom = useAppStore((s) => s.defaultZoom);
  const setDefaultZoom = useAppStore((s) => s.setDefaultZoom);
  const openLastDocumentAtStart = useAppStore((s) => s.openLastDocumentAtStart);
  const setOpenLastDocumentAtStart = useAppStore((s) => s.setOpenLastDocumentAtStart);

  async function pickFolder() {
    const selected = await pickPaths({ directory: true, multiple: false });
    const folder = selected[0];
    if (folder) setDefaultSaveFolder(folder);
  }

  return (
    <section className="k-settings-section" aria-labelledby="saving-opening-heading">
      <h3 id="saving-opening-heading">{t("saving_opening")}</h3>

      <div className="k-field-block">
        <span className="k-field-label">{t("default_save_folder")}</span>
        <p className="truncate text-sm" title={defaultSaveFolder ?? undefined}>
          {defaultSaveFolder ?? t("no_save_folder")}
        </p>
        <div className="mt-1 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => void pickFolder()}>
            {t("pick_folder")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={defaultSaveFolder === null}
            onClick={() => setDefaultSaveFolder(null)}
          >
            {t("clear_folder")}
          </Button>
        </div>
      </div>

      <div className="k-field-block">
        <label className="k-field-label" htmlFor="settings-default-zoom">
          {t("default_zoom")}
        </label>
        <select
          id="settings-default-zoom"
          className="k-select w-full"
          value={String(defaultZoom)}
          onChange={(e) => setDefaultZoom(Number(e.target.value))}
        >
          {DEFAULT_ZOOM_PRESETS.map((z) => (
            <option key={z} value={String(z)}>
              {`${Math.round(z * 100)}%`}
            </option>
          ))}
        </select>
      </div>

      <SettingSwitch checked={openLastDocumentAtStart} onChange={setOpenLastDocumentAtStart}>
        {t("open_last_at_start")}
      </SettingSwitch>
    </section>
  );
}
