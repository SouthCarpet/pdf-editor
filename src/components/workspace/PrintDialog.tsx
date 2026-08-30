import { useRef, useState } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { join, tempDir } from "@tauri-apps/api/path";
import { readFile, remove } from "@tauri-apps/plugin-fs";
import { useTranslation } from "react-i18next";
import { commands } from "@/bindings";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { writePendingAnnotationsCopy } from "@/lib/documentSave";
import { cn } from "@/lib/utils";
import {
  buildPrintPlan,
  DEFAULT_PRINT_OPTIONS,
  type PrintOptions,
  type PrintSheet,
} from "./printPlan";

export const PRINT_DPI = 300;
const LONG_DOCUMENT_PAGES = 10;

interface RenderedPage {
  page: number;
  url: string;
}

type RenderedSheet = PrintSheet<RenderedPage>;

interface PrintDialogProps {
  open: boolean;
  path: string;
  pageCount: number;
  disabled?: boolean;
  onOpenChange: (open: boolean) => void;
}

function SwitchControl({
  checked,
  disabled = false,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onCheckedChange?: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
      className={cn(
        "relative h-8 w-11 shrink-0 rounded-full border border-[var(--color-border)] bg-[var(--color-control)] p-1 transition-[background-color,opacity] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] disabled:cursor-not-allowed disabled:opacity-60",
        checked && "border-[var(--color-accent)] bg-[var(--color-accent)]",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "block size-5 rounded-full bg-[var(--color-card)] shadow-sm transition-transform",
          checked && "translate-x-3",
        )}
      />
    </button>
  );
}

function blobUrl(bytes: Uint8Array): string {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return URL.createObjectURL(new Blob([copy.buffer], { type: "image/png" }));
}

async function waitForPrintImages(root: HTMLElement): Promise<void> {
  const images = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    images.map(
      (image) =>
        new Promise<void>((resolve, reject) => {
          if (image.complete) {
            if (image.naturalWidth > 0) resolve();
            else reject(new Error("print-image-load"));
            return;
          }
          image.addEventListener("load", () => resolve(), { once: true });
          image.addEventListener("error", () => reject(new Error("print-image-load")), {
            once: true,
          });
        }),
    ),
  );
}

function PrintView({ sheets, slotsPerSheet }: { sheets: RenderedSheet[]; slotsPerSheet: 1 | 2 }) {
  return (
    <div data-pdf-print-root className="hidden" aria-hidden="true">
      <style>{`
        @media print {
          body.pdf-editor-printing * { visibility: hidden !important; }
          body.pdf-editor-printing [data-pdf-print-root],
          body.pdf-editor-printing [data-pdf-print-root] * { visibility: visible !important; }
          body.pdf-editor-printing [data-pdf-print-root] {
            display: block !important;
            position: absolute;
            inset: 0;
            width: 100%;
          }
          body.pdf-editor-printing .pdf-editor-print-sheet {
            display: flex !important;
            width: 100%;
            height: 100vh;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            break-after: page;
            page-break-after: always;
          }
          body.pdf-editor-printing .pdf-editor-print-sheet:last-child {
            break-after: auto;
            page-break-after: auto;
          }
          body.pdf-editor-printing .pdf-editor-print-slot {
            display: flex !important;
            width: 100%;
            height: 100%;
            align-items: center;
            justify-content: center;
          }
          body.pdf-editor-printing .pdf-editor-print-sheet[data-slots="2"] .pdf-editor-print-slot {
            width: 50%;
          }
          body.pdf-editor-printing .pdf-editor-print-slot img {
            display: block !important;
            width: 100%;
            height: 100%;
            object-fit: contain;
          }
        }
      `}</style>
      {sheets.map((sheet, sheetIndex) => (
        <div
          key={sheetIndex}
          className="pdf-editor-print-sheet"
          data-slots={slotsPerSheet}
        >
          {sheet.slice(0, slotsPerSheet).map((page, slotIndex) => (
            <div key={slotIndex} className="pdf-editor-print-slot">
              {page ? <img src={page.url} alt="" /> : null}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function PrintDialog({
  open,
  path,
  pageCount,
  disabled = false,
  onOpenChange,
}: PrintDialogProps) {
  const { t } = useTranslation(["workspace", "common"]);
  const [options, setOptions] = useState<PrintOptions>(DEFAULT_PRINT_OPTIONS);
  const [busy, setBusy] = useState(false);
  const [completedPages, setCompletedPages] = useState(0);
  const [renderedSheets, setRenderedSheets] = useState<RenderedSheet[]>([]);
  const [slotsPerSheet, setSlotsPerSheet] = useState<1 | 2>(1);
  const [notice, setNotice] = useState<"cancelled" | "error" | null>(null);
  const cancelRequested = useRef(false);
  const canPrint = !disabled && path.length > 0 && pageCount > 0;

  function updateOptions(patch: Partial<PrintOptions>) {
    setOptions((current) => ({ ...current, ...patch, printAsImage: true }));
    setNotice(null);
  }

  function cancel() {
    if (!busy) {
      onOpenChange(false);
      return;
    }
    cancelRequested.current = true;
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && busy) {
      cancelRequested.current = true;
      return;
    }
    onOpenChange(nextOpen);
  }

  async function print() {
    if (!canPrint || busy) return;

    const plan = buildPrintPlan(options, pageCount);
    const urls: string[] = [];
    const temporaryRenderPaths: string[] = [];
    let temporaryPdf: string | null = null;
    setBusy(true);
    setCompletedPages(0);
    setNotice(null);
    cancelRequested.current = false;

    try {
      let printSource = path;
      if (plan.source === "filled") {
        temporaryPdf = await join(
          await tempDir(),
          `pdf-editor-print-${crypto.randomUUID()}.pdf`,
        );
        const written = await writePendingAnnotationsCopy(path, temporaryPdf);
        if (!written) throw new Error("print-annotation-apply");
        printSource = temporaryPdf;
      }

      if (cancelRequested.current) throw new DOMException("cancelled", "AbortError");

      const pages = new Map<number, RenderedPage>();
      for (let page = 1; page <= plan.pageCount; page += 1) {
        if (cancelRequested.current) throw new DOMException("cancelled", "AbortError");
        const result = await commands.renderPageThumbnail(printSource, page - 1, PRINT_DPI);
        if (result.status !== "ok") throw new Error("print-render");
        if (temporaryPdf) temporaryRenderPaths.push(result.data);
        if (cancelRequested.current) throw new DOMException("cancelled", "AbortError");
        const url = blobUrl(await readFile(result.data));
        urls.push(url);
        pages.set(page, { page, url });
        setCompletedPages(page);
      }

      const sheets = plan.sheets.map(
        ([left, right]): RenderedSheet => [
          left === null ? null : (pages.get(left) ?? null),
          right === null ? null : (pages.get(right) ?? null),
        ],
      );
      setSlotsPerSheet(plan.slotsPerSheet);
      setRenderedSheets(sheets);

      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
      const root = document.querySelector<HTMLElement>("[data-pdf-print-root]");
      if (!root) throw new Error("print-view-missing");
      await waitForPrintImages(root);
      if (cancelRequested.current) throw new DOMException("cancelled", "AbortError");

      document.body.classList.add("pdf-editor-printing");
      window.print();
      onOpenChange(false);
    } catch (error) {
      setNotice(
        error instanceof DOMException && error.name === "AbortError" ? "cancelled" : "error",
      );
    } finally {
      document.body.classList.remove("pdf-editor-printing");
      urls.forEach((url) => URL.revokeObjectURL(url));
      setRenderedSheets([]);
      if (temporaryPdf) {
        await Promise.all(temporaryRenderPaths.map((renderPath) => remove(renderPath).catch(() => undefined)));
        await remove(temporaryPdf).catch(() => undefined);
      }
      setBusy(false);
    }
  }

  const progress = pageCount === 0 ? 0 : Math.round((completedPages / pageCount) * 100);

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          closeLabel={t("common:close")}
          className="max-w-[360px] gap-3 rounded-lg p-4"
        >
          <DialogHeader className="pr-8">
            <DialogTitle className="text-balance">{t("workspace:print.title")}</DialogTitle>
            <DialogDescription className="text-pretty">
              {t("workspace:print.description")}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-1 divide-y divide-[var(--color-border)]">
            <div
              role="radiogroup"
              aria-label={t("workspace:print.content_label")}
              className="grid h-8 grid-cols-2 rounded-md border border-[var(--color-border)] bg-[var(--color-control)] p-0.5"
            >
              {(["filled", "original"] as const).map((content) => (
                <button
                  key={content}
                  type="button"
                  role="radio"
                  aria-checked={options.content === content}
                  disabled={busy}
                  onClick={() => updateOptions({ content })}
                  className="rounded text-xs font-medium text-[var(--color-muted)] transition-[background-color,color,scale] active:not-disabled:scale-[0.96] aria-checked:bg-[var(--color-card)] aria-checked:text-[var(--color-foreground)] aria-checked:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] disabled:opacity-50"
                >
                  {content === "filled"
                    ? t("workspace:print.filled")
                    : t("workspace:print.original")}
                </button>
              ))}
            </div>

            <div className="flex min-h-14 items-center justify-between gap-4 py-2">
              <div>
                <p className="text-sm font-medium">{t("workspace:print.as_image")}</p>
                <p id="print-image-note" className="text-pretty text-xs text-[var(--color-muted)]">
                  {t("workspace:print.image_always_note")}
                </p>
              </div>
              <Tooltip.Provider delayDuration={300}>
                <Tooltip.Root>
                  <Tooltip.Trigger asChild>
                    <span tabIndex={0} className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]">
                      <SwitchControl
                        checked
                        disabled
                        label={t("workspace:print.as_image")}
                      />
                    </span>
                  </Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Content
                      side="top"
                      className="z-[60] max-w-56 rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-2 py-1.5 text-xs text-[var(--color-foreground)] shadow-lg"
                    >
                      {t("workspace:print.image_tooltip")}
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>
              </Tooltip.Provider>
            </div>

            <div className="flex min-h-14 items-center justify-between gap-4 py-2">
              <div>
                <p className="text-sm font-medium">{t("workspace:print.booklet")}</p>
                <p className="text-pretty text-xs text-[var(--color-muted)]">
                  {t("workspace:print.booklet_note")}
                </p>
              </div>
              <SwitchControl
                checked={options.booklet}
                disabled={busy}
                label={t("workspace:print.booklet")}
                onCheckedChange={(booklet) => updateOptions({ booklet })}
              />
            </div>

            <div className="flex min-h-12 items-center justify-between gap-4 py-2">
              <p className="text-sm font-medium">{t("workspace:print.reverse")}</p>
              <SwitchControl
                checked={options.reverse}
                disabled={busy}
                label={t("workspace:print.reverse")}
                onCheckedChange={(reverse) => updateOptions({ reverse })}
              />
            </div>
          </div>

          {busy && pageCount >= LONG_DOCUMENT_PAGES ? (
            <div className="space-y-1.5" role="status">
              <div className="flex justify-between text-xs tabular-nums text-[var(--color-muted)]">
                <span>{t("workspace:print.preparing")}</span>
                <span>{t("workspace:print.progress", { current: completedPages, total: pageCount })}</span>
              </div>
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
                className="h-1.5 overflow-hidden rounded-full bg-[var(--color-control)]"
              >
                <div
                  className="h-full rounded-full bg-[var(--color-accent)] transition-transform"
                  style={{ transform: `translateX(${progress - 100}%)` }}
                />
              </div>
            </div>
          ) : null}

          {notice ? (
            <p role="status" className="text-pretty text-xs text-[var(--color-muted)]">
              {notice === "cancelled"
                ? t("workspace:print.cancelled")
                : t("workspace:print.error")}
            </p>
          ) : null}

          <DialogFooter className="flex-row justify-end space-x-2">
            <Button type="button" variant="ghost" size="sm" onClick={cancel}>
              {busy ? t("workspace:print.stop") : t("common:cancel")}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!canPrint || busy}
              onClick={() => void print()}
            >
              {busy ? t("workspace:print.preparing") : t("workspace:print.action")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <PrintView sheets={renderedSheets} slotsPerSheet={slotsPerSheet} />
    </>
  );
}
