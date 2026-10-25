import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { commands } from "@/bindings";
import type { TextDiffResult, VisualDiffPage } from "@/bindings";
import { useDocuments } from "@/stores/documentStore";
import { pickPaths } from "@/tauri/bridge";
import {
  CompareOptions,
  DEFAULT_COMPARE_OPTIONS,
  type CompareOptionsValue,
} from "@/components/tools/options/CompareOptions";

export type CompareMode = "visual" | "text";

interface Props {
  leftPath: string | null;
  rightPath: string | null;
  mode: CompareMode;
  setLeftPath: (path: string | null) => void;
  setRightPath: (path: string | null) => void;
  setMode: (mode: CompareMode) => void;
  onVisualResult: (pages: VisualDiffPage[] | null) => void;
  onTextResult: (result: TextDiffResult | null) => void;
  visualResult: VisualDiffPage[] | null;
  textResult: TextDiffResult | null;
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
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
  visualResult,
  textResult,
}: Props) {
  const { t } = useTranslation("workspace");
  const documentMap = useDocuments((state) => state.documents);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showOpenTabs, setShowOpenTabs] = useState(false);
  const [options, setOptions] = useState<CompareOptionsValue>({
    ...DEFAULT_COMPARE_OPTIONS,
    mode,
  });
  const otherOpenDocuments = Array.from(documentMap.values())
    .filter((document) => document.path !== leftPath)
    .slice(0, 4);

  function clearResults() {
    setError(null);
    onVisualResult(null);
    onTextResult(null);
  }

  function chooseLeft(path: string) {
    clearResults();
    setLeftPath(path);
    if (rightPath === path) setRightPath(null);
  }

  function chooseRight(path: string) {
    clearResults();
    setShowOpenTabs(false);
    setRightPath(path);
  }

  async function pick(side: "left" | "right") {
    const selected = await pickPaths({
      multiple: false,
      directory: false,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    const path = selected[0];
    if (!path) return;
    if (side === "left") chooseLeft(path);
    else chooseRight(path);
  }

  function setOptionsAndMode(next: CompareOptionsValue) {
    setOptions(next);
    if (next.mode !== mode) {
      clearResults();
      setMode(next.mode);
    }
  }

  async function runCompare() {
    if (!leftPath || !rightPath) return;
    setBusy(true);
    setError(null);
    try {
      const args = {
        left: leftPath,
        right: rightPath,
        dpi: options.visualDpi,
        tolerance: options.visualTolerancePercent / 100,
        job_id: crypto.randomUUID(),
      };
      if (mode === "visual") {
        const result = await commands.compareVisualCmd(args);
        if (result.status === "error") {
          setError(JSON.stringify(result.error));
          return;
        }
        onVisualResult(result.data.pages);
        onTextResult(null);
      } else {
        const result = await commands.compareTextCmd(args);
        if (result.status === "error") {
          setError(JSON.stringify(result.error));
          return;
        }
        onTextResult(result.data);
        onVisualResult(null);
      }
    } finally {
      setBusy(false);
    }
  }

  return renderPanel();

  function renderPanel() {
    return (
      <section aria-label={t("compare.panel_label")} className="space-y-4">
        <h2 className="text-sm font-semibold text-balance">{t("compare.title")}</h2>

        <DocumentSelection
          label={t("compare.left_document")}
          path={leftPath}
          emptyLabel={t("compare.select_first")}
          actionLabel={leftPath ? t("compare.change") : t("compare.pick_file")}
          onAction={() => void pick("left")}
        />

        {renderSecondDocumentPicker()}

        {rightPath ? (
          <DocumentSelection
            label={t("compare.right_document")}
            path={rightPath}
            emptyLabel={t("compare.select_second")}
            actionLabel={t("compare.change")}
            onAction={() => {
              clearResults();
              setRightPath(null);
            }}
          />
        ) : null}

        {leftPath && rightPath ? (
          <>
            <CompareOptions value={options} onChange={setOptionsAndMode} mode="standalone" />
            <Button className="min-h-[var(--control-h)] w-full" disabled={busy} onClick={runCompare}>
              {busy ? t("compare.running") : t("compare.run")}
            </Button>
          </>
        ) : null}

        {error ? (
          <p role="alert" className="text-xs text-[var(--color-danger)]">
            {error}
          </p>
        ) : null}

        <CompareResults mode={mode} visualResult={visualResult} textResult={textResult} />
      </section>
    );
  }
  function renderSecondDocumentPicker() {
    if (!leftPath || rightPath) return null;
    return (
      <div className="space-y-3 border-t border-[var(--color-border)] pt-4">
        <p className="text-pretty text-sm font-medium">{t("compare.select_second")}</p>
        <Button className="min-h-[var(--control-h)] w-full" onClick={() => void pick("right")}>
          {t("compare.pick_file")}
        </Button>
        <Button
          className="min-h-[var(--control-h)] w-full"

          variant="outline"
          disabled={otherOpenDocuments.length === 0}
          onClick={() => setShowOpenTabs((visible) => !visible)}
        >
          {t("compare.pick_open_tab")}
        </Button>
        {showOpenTabs ? (
          <div className="space-y-1" aria-label={t("compare.open_tabs_label")}>
            {otherOpenDocuments.map((document) => (
              <Button
                key={document.id}
                className="min-h-[var(--control-h)] w-full justify-start px-3"

                variant="ghost"
                title={document.path}
                onClick={() => chooseRight(document.path)}
              >
                <span className="truncate">{fileName(document.path)}</span>
              </Button>
            ))}
          </div>
        ) : null}
        {otherOpenDocuments.length === 0 ? (
          <p className="text-pretty text-xs text-[var(--color-text-muted)]">
            {t("compare.no_open_tabs")}
          </p>
        ) : null}
      </div>
    );
  }
}

function DocumentSelection({
  label,
  path,
  emptyLabel,
  actionLabel,
  onAction,
}: {
  label: string;
  path: string | null;
  emptyLabel: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium text-[var(--color-text-muted)]">{label}</div>
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-xs" title={path ?? undefined}>
          {path ? fileName(path) : emptyLabel}
        </span>
        <Button className="min-h-[var(--control-h)] shrink-0" variant="outline" onClick={onAction}>
          {actionLabel}
        </Button>
      </div>
    </div>
  );
}

function CompareResults({
  mode,
  visualResult,
  textResult,
}: {
  mode: CompareMode;
  visualResult: VisualDiffPage[] | null;
  textResult: TextDiffResult | null;
}) {
  const { t } = useTranslation("workspace");
  if (mode === "visual" && visualResult) {
    const changedPages = visualResult.filter(
      (page) => page.changed_pixel_ratio != null && page.changed_pixel_ratio > 0,
    );
    return (
      <div className="space-y-2 border-t border-[var(--color-border)] pt-4 text-xs">
        <h3 className="font-medium">{t("compare.results")}</h3>
        {changedPages.length === 0 ? (
          <p className="text-pretty text-[var(--color-text-muted)]">
            {t("compare.no_visual_differences")}
          </p>
        ) : (
          <ul className="space-y-1">
            {changedPages.map((page) => (
              <li
                key={page.page_index}
                className="rounded-md bg-[var(--color-warning-soft)] px-2 py-1.5 text-[var(--color-text)] tabular-nums"
              >
                {t("compare.visual_page_change", {
                  page: page.page_index + 1,
                  percent: ((page.changed_pixel_ratio ?? 0) * 100).toFixed(1),
                })}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  if (mode === "text" && textResult) {
    return (
      <div className="space-y-2 border-t border-[var(--color-border)] pt-4 text-xs">
        <h3 className="font-medium">{t("compare.text_differences")}</h3>
        {textResult.changes.length === 0 ? (
          <p className="text-pretty text-[var(--color-text-muted)]">
            {t("compare.no_text_differences")}
          </p>
        ) : (
          <ul className="space-y-1">
            {textResult.changes.map((change, index) => (
              <li key={`${change.kind}-${index}`} className="text-pretty">
                {change.kind === "delete" ? (
                  <span className="bg-[var(--color-danger-soft)] px-1 text-[var(--color-danger)] line-through">
                    {change.left}
                  </span>
                ) : null}
                {change.kind === "insert" ? (
                  <span className="bg-[var(--color-success-soft)] px-1 text-[var(--color-text)]">
                    {change.right}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return null;
}
