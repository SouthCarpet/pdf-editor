// Phase 13 Task 72 - OCR language management UI.
//
// Lists installed `.traineddata` files (bundled defaults + extra dir).
// "Add language file" prompts a file dialog; on confirm the chosen file
// is copied into the user's tessdata-extra dir and the list refreshes.
import { useEffect, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { TriangleAlert } from "lucide-react";
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
    <section className="k-settings-section" aria-labelledby="ocr-languages-heading">
      <div>
        <h3 id="ocr-languages-heading">{t("ocr_languages")}</h3>
        <p className="k-caption">{t("ocr_languages_description")}</p>
      </div>
      <p className="k-field-label">{t("ocr_backend_languages", { engine: "Tesseract" })}</p>
      <ul className="border-t border-[var(--color-border)] text-sm">
        {langs.map((l) => (
          <li
            key={l}
            className="flex items-center justify-between border-b border-[var(--color-border)] py-1.5"
          >
            <span className="k-num">{l}</span>
            <span className="k-caption">
              {t(BUILTIN.has(l) ? "ocr_language_builtin" : "ocr_language_user")}
            </span>
          </li>
        ))}
      </ul>
      <div>
        <Button onClick={addLang} variant="outline" size="sm" disabled={busy}>
          {t(busy ? "ocr_adding_language" : "ocr_add_language")}
        </Button>
      </div>
      {err && (
        <p role="alert" className="k-field-error break-words">
          {err}
        </p>
      )}
      {rapidocr && (
        <div className="space-y-2 border-t border-[var(--color-border)] pt-3">
          <p className="k-field-label">
            {t("ocr_backend_languages", { engine: rapidocr.display_name })}
          </p>
          <div className="flex flex-wrap gap-1">
            {rapidocr.supported_languages.map((language) => (
              <code
                key={language}
                className="k-num rounded-[var(--radius-sm)] border border-[var(--color-border)] px-1.5 py-0.5 text-xs"
              >
                {language}
              </code>
            ))}
          </div>
          {!rapidocr.available && rapidocr.unavailable_reason && (
            <div className="k-alert k-alert--warning" role="status">
              <TriangleAlert className="k-alert-icon h-4 w-4" aria-hidden="true" />
              <p className="k-alert-body break-words">
                {t("ocr_backend_unavailable", {
                  reason: rapidocr.unavailable_reason,
                })}
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}