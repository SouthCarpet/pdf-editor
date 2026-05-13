// Phase 11 Task 65 — Compare panel.
//
// Two file pickers (left + right), a Visual/Text mode toggle, and the
// trigger that fires the backend diff. The actual side-by-side viewer
// lives in CompareViewer.tsx and is wired by the parent route.
import { useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { commands } from "@/bindings";
import type { TextDiffResult, VisualDiffPage } from "@/bindings";

export type CompareMode = "visual" | "text";

interface Props {
  leftPath: string | null;
  rightPath: string | null;
  mode: CompareMode;
  setLeftPath: (p: string | null) => void;
  setRightPath: (p: string | null) => void;
  setMode: (m: CompareMode) => void;
  onVisualResult: (pages: VisualDiffPage[]) => void;
  onTextResult: (result: TextDiffResult) => void;
}

export function ComparePanel({
  leftPath,
  rightPath,
  mode,
  setLeftPath,
  setRightPath,
  setMode,
  onVisualResult,
  onTextResult,
}: Props) {
  const { t } = useTranslation("common");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function pick(side: "left" | "right") {
    const sel = await openDialog({
      multiple: false,
      directory: false,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (!sel || Array.isArray(sel)) return;
    if (side === "left") setLeftPath(sel);
    else setRightPath(sel);
  }

  async function runCompare() {
    if (!leftPath || !rightPath) return;
    setBusy(true);
    setErr(null);
    try {
      const args = {
        left: leftPath,
        right: rightPath,
        dpi: 100,
        tolerance: 0.05,
        job_id: crypto.randomUUID(),
      };
      if (mode === "visual") {
        const r = await commands.compareVisualCmd(args);
        if (r.status === "error") {
          setErr(JSON.stringify(r.error));
          return;
        }
        onVisualResult(r.data.pages);
      } else {
        const r = await commands.compareTextCmd(args);
        if (r.status === "error") {
          setErr(JSON.stringify(r.error));
          return;
        }
        onTextResult(r.data);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium">{t("tools.compare")}</h3>

      <div className="space-y-1">
        <div className="text-xs text-[var(--color-muted)]">Left</div>
        <div className="flex items-center gap-2">
          <span className="flex-1 truncate text-xs">{leftPath ?? "(none)"}</span>
          <Button size="sm" variant="outline" onClick={() => pick("left")}>
            Pick
          </Button>
        </div>
      </div>
      <div className="space-y-1">
        <div className="text-xs text-[var(--color-muted)]">Right</div>
        <div className="flex items-center gap-2">
          <span className="flex-1 truncate text-xs">{rightPath ?? "(none)"}</span>
          <Button size="sm" variant="outline" onClick={() => pick("right")}>
            Pick
          </Button>
        </div>
      </div>

      <div className="flex gap-1 rounded border p-1">
        <Button
          size="sm"
          variant={mode === "visual" ? "default" : "ghost"}
          onClick={() => setMode("visual")}
        >
          Visual
        </Button>
        <Button
          size="sm"
          variant={mode === "text" ? "default" : "ghost"}
          onClick={() => setMode("text")}
        >
          Text
        </Button>
      </div>

      <Button
        size="sm"
        disabled={!leftPath || !rightPath || busy}
        onClick={runCompare}
      >
        {busy ? "Comparing…" : "Run compare"}
      </Button>
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  );
}
