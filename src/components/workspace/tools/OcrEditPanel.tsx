import { useState } from "react";
import { useTranslation } from "react-i18next";
import { commands, type OcrSelectableWord } from "@/bindings";
import { Button } from "@/components/ui/button";
import { pickSavePath } from "@/tauri/bridge";

interface Props {
  docPath: string;
  pageIndex: number;
  words: OcrSelectableWord[];
  selectedIds: Set<number>;
  loading: boolean;
  layerNotice: string | null;
  onClearSelection: () => void;
}

export function OcrEditPanel({
  docPath,
  pageIndex,
  words,
  selectedIds,
  loading,
  layerNotice,
  onClearSelection,
}: Props) {
  const { t } = useTranslation("workspace");
  const [replacement, setReplacement] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function apply(mode: "erase" | "replace") {
    if (selectedIds.size === 0 || (mode === "replace" && replacement.trim() === "")) return;
    const output = await pickSavePath({
      defaultPath: docPath.replace(/\.pdf$/i, ".ocr-edited.pdf"),
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (!output) return;
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const result = await commands.editOcrPageWordsCmd({
        input: docPath,
        output,
        page_index: pageIndex,
        word_ids: [...selectedIds],
        replacement: mode === "replace" ? replacement : null,
      });
      if (result.status === "error") {
        setError(formatCommandError(result.error));
        return;
      }
      setNotice(
        result.data.skipped_word_ids.length > 0
          ? t("ocr_edit.saved_patch_only")
          : t(mode === "replace" ? "ocr_edit.saved_replacement" : "ocr_edit.saved_erase")
      );
      onClearSelection();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="ocr-edit-title" className="space-y-3">
      <div>
        <h3 id="ocr-edit-title" className="text-sm font-semibold">
          {t("ocr_edit.title")}
        </h3>
        <p className="mt-1 text-[11px] leading-relaxed text-[var(--color-muted)]">
          {t("ocr_edit.description")}
        </p>
      </div>

      {loading ? (
        <p className="text-xs text-[var(--color-muted)]">{t("ocr_edit.loading")}</p>
      ) : layerNotice ? (
        <p role="status" className="text-xs text-[var(--color-warning-text)]">
          {t("ocr_edit.no_layer")}
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between text-xs">
            <span>{t("ocr_edit.word_count", { count: words.length })}</span>
            <span className="font-medium text-[var(--color-accent-soft-foreground)]">
              {t("ocr_edit.selected_count", { count: selectedIds.size })}
            </span>
          </div>
          <p className="text-[11px] leading-relaxed text-[var(--color-muted)]">
            {t("ocr_edit.selection_help")}
          </p>
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            disabled={busy || selectedIds.size === 0}
            onClick={() => void apply("erase")}
          >
            {busy ? t("ocr_edit.saving") : t("ocr_edit.erase")}
          </Button>
          <label className="block space-y-1 text-xs font-medium">
            <span>{t("ocr_edit.replacement_text")}</span>
            <input
              value={replacement}
              onChange={(event) => setReplacement(event.target.value)}
              className="h-8 w-full rounded border border-[var(--color-border)] bg-[var(--color-card)] px-2 text-xs"
            />
          </label>
          <Button
            size="sm"
            className="w-full"
            disabled={busy || selectedIds.size === 0 || replacement.trim() === ""}
            onClick={() => void apply("replace")}
          >
            {busy ? t("ocr_edit.saving") : t("ocr_edit.replace")}
          </Button>
          <p className="text-[10px] leading-relaxed text-[var(--color-muted)]">
            {t("ocr_edit.undo_note")}
          </p>
        </>
      )}
      {notice && (
        <p role="status" className="text-xs text-[var(--color-success-text)]">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-[var(--color-danger-text)]">
          {error}
        </p>
      )}
    </section>
  );
}

function formatCommandError(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "data" in error &&
    typeof error.data === "object" &&
    error.data !== null &&
    "detail" in error.data &&
    typeof error.data.detail === "string"
  ) {
    return error.data.detail;
  }
  return JSON.stringify(error);
}
