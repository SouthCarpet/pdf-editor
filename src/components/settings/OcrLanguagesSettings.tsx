// Phase 13 Task 72 — OCR language management UI.
//
// Lists installed `.traineddata` files (bundled defaults + extra dir).
// "Add language file" prompts a file dialog; on confirm the chosen file
// is copied into the user's tessdata-extra dir and the list refreshes.
import { useEffect, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { commands } from "@/bindings";
import { useOcrBackends } from "@/hooks/useOcrBackends";

const BUILTIN = new Set(["eng", "slk", "ces", "deu", "pol"]);

export function OcrLanguagesSettings() {
  const { t } = useTranslation("settings");
  const [langs, setLangs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const backends = useOcrBackends();
  const rapidocr = backends.find((backend) => backend.id === "rapidocr");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await commands.listOcrLanguages();
      if (cancelled) return;
      if (r.status === "ok") setLangs(r.data);
      else setErr(JSON.stringify(r.error));
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshTick]);
  const refresh = () => setRefreshTick((t) => t + 1);

  async function addLang() {
    const picked = await openDialog({
      multiple: false,
      directory: false,
      filters: [{ name: "Tesseract data", extensions: ["traineddata"] }],
    });
    if (!picked) return;
    const sourcePath = typeof picked === "string" ? picked : (picked as { path: string }).path;
    setBusy(true);
    setErr(null);
    try {
      const r = await commands.addOcrLanguage(sourcePath);
      if (r.status === "error") setErr(JSON.stringify(r.error));
      else refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">{t("ocr_languages")}</h3>
        <p className="text-xs text-[var(--color-muted)]">{t("ocr_languages_description")}</p>
      </div>
      <p className="text-xs font-medium">{t("ocr_backend_languages", { engine: "Tesseract" })}</p>
      <ul className="space-y-1 text-sm">
        {langs.map((l) => (
          <li
            key={l}
            className="flex items-center justify-between rounded border border-[var(--color-border)] px-2 py-1"
          >
            <span>{l}</span>
            <span className="text-[10px] tracking-wider text-[var(--color-muted)] uppercase">
              {t(BUILTIN.has(l) ? "ocr_language_builtin" : "ocr_language_user")}
            </span>
          </li>
        ))}
      </ul>
      <Button onClick={addLang} variant="outline" size="sm" disabled={busy}>
        {t(busy ? "ocr_adding_language" : "ocr_add_language")}
      </Button>
      {err && <p className="text-xs text-[var(--color-danger-text)]">{err}</p>}
      {rapidocr && (
        <div className="space-y-2 border-t border-[var(--color-border)] pt-3">
          <p className="text-xs font-medium">
            {t("ocr_backend_languages", { engine: rapidocr.display_name })}
          </p>
          <div className="flex flex-wrap gap-1">
            {rapidocr.supported_languages.map((language) => (
              <code
                key={language}
                className="rounded border border-[var(--color-border)] px-1.5 py-0.5 text-xs"
              >
                {language}
              </code>
            ))}
          </div>
          {!rapidocr.available && rapidocr.unavailable_reason && (
            <p className="text-xs break-words text-[var(--color-warning)]">
              {t("ocr_backend_unavailable", {
                reason: rapidocr.unavailable_reason,
              })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
