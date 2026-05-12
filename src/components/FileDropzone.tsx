import { open } from "@tauri-apps/plugin-dialog";
import { useState, type DragEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

interface Props {
  multiple?: boolean;
  accept?: string[];
  onFiles: (paths: string[]) => void;
  children?: ReactNode;
}

// File picker dropzone. The "Open" button uses Tauri's native dialog plugin
// (always works). Drag-and-drop currently relies on `dataTransfer.files[i].path`
// — only Tauri's drag-drop event payload populates that field; browser-side
// DnD on Tauri 2 surfaces empty paths.
// TODO(phase-19): wire Tauri's `webview.onDragDropEvent` to receive OS paths
// and forward them via `onFiles` (this current implementation is the fallback
// path used during development inside the browser preview).
export function FileDropzone({ multiple = true, accept = ["pdf"], onFiles, children }: Props) {
  const { t } = useTranslation("common");
  const [hover, setHover] = useState(false);

  async function pick() {
    const sel = await open({
      multiple,
      filters: [{ name: "PDF", extensions: accept }],
    });
    if (sel === null) return;
    onFiles(Array.isArray(sel) ? sel : [sel]);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setHover(false);
    // Tauri 2 drag-drop event populates `path` on the DataTransfer file objects.
    // Browser DnD does not — those entries get filtered out by `.filter(Boolean)`.
    const paths = Array.from(e.dataTransfer.files)
      .map((f) => (f as File & { path?: string }).path)
      .filter((p): p is string => typeof p === "string" && p.length > 0);
    if (paths.length) onFiles(paths);
  }

  return (
    <div
      className={`flex min-h-48 flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 transition-colors ${
        hover
          ? "border-neutral-700 bg-neutral-100 dark:bg-neutral-900"
          : "border-[var(--color-border)]"
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setHover(true);
      }}
      onDragLeave={() => setHover(false)}
      onDrop={onDrop}
    >
      {children ?? (
        <p className="text-sm text-[var(--color-muted)]">Drag files here</p>
      )}
      <Button variant="outline" onClick={pick}>
        {t("open")}
      </Button>
    </div>
  );
}
