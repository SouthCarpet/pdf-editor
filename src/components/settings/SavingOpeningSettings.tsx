import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { DEFAULT_ZOOM_PRESETS, useAppStore } from "@/stores/appStore";
import { pickPaths } from "@/tauri/bridge";

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
    <section aria-labelledby="saving-opening-heading" className="space-y-6">
      <h2 id="saving-opening-heading" className="text-lg font-semibold text-balance">
        {t("saving_opening")}
      </h2>

      <div>
        <p className="text-sm font-medium">{t("default_save_folder")}</p>
        <p
          className="mt-1 truncate text-sm text-[var(--color-muted)]"
          title={defaultSaveFolder ?? undefined}
        >
          {defaultSaveFolder ?? t("no_save_folder")}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
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

      <div>
        <label className="text-sm font-medium" htmlFor="settings-default-zoom">
          {t("default_zoom")}
        </label>
        <select
          id="settings-default-zoom"
          className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-card)] p-2"
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

      <div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={openLastDocumentAtStart}
            onChange={(e) => setOpenLastDocumentAtStart(e.target.checked)}
          />
          {t("open_last_at_start")}
        </label>
      </div>
    </section>
  );
}
