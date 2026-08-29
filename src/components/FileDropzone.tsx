import { useState, type DragEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { pickPaths } from "@/tauri/bridge";

interface Props {
  multiple?: boolean;
  accept?: string[];
  onFiles: (paths: string[]) => void;
  children?: ReactNode;
}

// Context-specific picker/dropzone used by tools and project attachments.
// Browser drag events are a development-preview fallback. Native OS drops are
// handled app-wide by OpenFilesProvider through Tauri's onDragDropEvent API.
export function FileDropzone({ multiple = true, accept = ["pdf"], onFiles, children }: Props) {
  const { t } = useTranslation("common");
  const [hover, setHover] = useState(false);

  async function pick() {
    const selected = await pickPaths({
      multiple,
      filters: [{ name: "PDF", extensions: accept }],
    });
    if (selected.length === 0) return;
    onFiles(selected);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setHover(false);
    // Tauri 2 drag-drop event populates `path` on the DataTransfer file objects.
    // Browser DnD does not - those entries get filtered out by `.filter(Boolean)`.
    const paths = Array.from(e.dataTransfer.files)
      .map((f) => (f as File & { path?: string }).path)
      .filter((p): p is string => typeof p === "string" && p.length > 0);
    if (paths.length) onFiles(paths);
  }

  return (
    <div
      className={`flex min-h-48 flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed bg-[var(--color-dropzone)] p-8 text-[var(--color-foreground)] transition-colors ${
        hover
          ? "border-[var(--color-dropzone-border-active)] bg-[var(--color-dropzone-active)]"
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
        <p
          data-testid="dropzone-placeholder"
          className="text-sm text-[var(--color-placeholder)]"
        >
          {t("drop_files")}
        </p>
      )}
      <Button variant="outline" onClick={pick}>
        {t("open")}
      </Button>
    </div>
  );
}
