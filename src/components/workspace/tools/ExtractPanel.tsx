// Phase 11 Task 64 — Extract panel. Reuses `extract_pages_cmd` from
// Phase 9 Task 51 (no new Rust command). User picks a subset of pages
// in a checkbox grid; "Extract selected to new PDF" opens a save dialog
// and invokes the command.
import { useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { commands } from "@/bindings";

interface Props {
  docPath: string;
  pageCount: number;
}

export function ExtractPanel({ docPath, pageCount }: Props) {
  const { t } = useTranslation("common");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function toggle(i: number) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(i)) {
        n.delete(i);
      } else {
        n.add(i);
      }
      return n;
    });
  }
  function selectAll() {
    setSelected(new Set(Array.from({ length: pageCount }, (_, i) => i)));
  }
  function clear() {
    setSelected(new Set());
  }

  async function extract() {
    setBusy(true);
    setErr(null);
    try {
      const out = await save({
        defaultPath: docPath.replace(/\.pdf$/i, ".extract.pdf"),
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
      if (!out) {
        setBusy(false);
        return;
      }
      // Pages are 1-based on the Rust side.
      const pages = Array.from(selected).sort((a, b) => a - b).map((p) => p + 1);
      const r = await commands.extractPagesCmd({
        input: docPath,
        output: out,
        pages,
        job_id: crypto.randomUUID(),
      });
      if (r.status === "error") {
        setErr(JSON.stringify(r.error));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium">{t("tools.extract")}</h3>
      <p className="text-xs text-[var(--color-muted)]">
        Select pages to extract into a new PDF.
      </p>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={selectAll}>
          Select all
        </Button>
        <Button size="sm" variant="outline" onClick={clear}>
          Clear
        </Button>
      </div>
      <div className="grid max-h-[420px] grid-cols-3 gap-2 overflow-auto rounded border p-2 text-xs">
        {Array.from({ length: pageCount }, (_, i) => (
          <label
            key={i}
            className="flex cursor-pointer flex-col items-center gap-1 rounded px-1 py-2 hover:bg-[var(--color-control-hover)]"
          >
            <input
              type="checkbox"
              checked={selected.has(i)}
              onChange={() => toggle(i)}
            />
            <span>{i + 1}</span>
          </label>
        ))}
      </div>
      <Button size="sm" disabled={selected.size === 0 || busy} onClick={extract}>
        {busy ? "Extracting…" : `Extract ${selected.size}`}
      </Button>
      {err && <p className="text-xs text-[var(--color-danger-text)]">{err}</p>}
    </div>
  );
}
