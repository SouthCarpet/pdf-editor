// Phase 13 Task 72 — OCR language management UI.
//
// Lists installed `.traineddata` files (bundled defaults + extra dir).
// "Add language file" prompts a file dialog; on confirm the chosen file
// is copied into the user's tessdata-extra dir and the list refreshes.
import { useEffect, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { Button } from "@/components/ui/button";
import { commands } from "@/bindings";

const BUILTIN = new Set(["eng", "slk", "ces", "deu"]);

export function OcrLanguagesSettings() {
  const [langs, setLangs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

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
        <h3 className="text-sm font-semibold">OCR languages</h3>
        <p className="text-xs text-[var(--color-muted)]">
          Drop a tesseract `.traineddata` file here to add a language. Built-in
          languages cannot be removed.
        </p>
      </div>
      <ul className="space-y-1 text-sm">
        {langs.map((l) => (
          <li
            key={l}
            className="flex items-center justify-between rounded border border-[var(--color-border)] px-2 py-1"
          >
            <span>{l}</span>
            <span className="text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
              {BUILTIN.has(l) ? "built-in" : "user"}
            </span>
          </li>
        ))}
      </ul>
      <Button onClick={addLang} variant="outline" size="sm" disabled={busy}>
        {busy ? "Adding…" : "Add language file"}
      </Button>
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  );
}
