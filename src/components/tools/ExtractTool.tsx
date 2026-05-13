import { save } from "@tauri-apps/plugin-dialog";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileDropzone } from "@/components/FileDropzone";
import { ProgressList } from "@/components/ProgressList";
import { ToolPage } from "@/components/ToolPage";
import { useToolJob } from "@/hooks/useToolJob";
import { parsePageList } from "@/lib/parsePageList";

// Conservative upper bound for client-side page-list validation. The Rust
// side will surface its own InvalidArgument if a page > real page-count.
const MAX_PAGE_HINT = 100000;

export function ExtractTool() {
  const { t } = useTranslation();
  const [file, setFile] = useState<string | null>(null);
  const [pageInput, setPageInput] = useState("1");
  const { run, cancelActive, activeId } = useToolJob("extract");

  const pages = useMemo(() => parsePageList(pageInput, MAX_PAGE_HINT), [pageInput]);
  const valid = pages !== null && pages.length > 0;

  async function onRun() {
    if (!file || !pages) return;
    const out = await save({
      filters: [{ name: "PDF", extensions: ["pdf"] }],
      defaultPath: "extracted.pdf",
    });
    if (!out) return;
    await run(
      "extract_pages_cmd",
      { args: { input: file, pages, output: out, jobId: "" } },
      [file],
    ).catch(() => {});
  }

  return (
    <ToolPage
      title={t("tools.extract")}
      description="Extract selected pages into a new PDF."
    >
      <FileDropzone onFiles={(p) => setFile(p[0] ?? null)} multiple={false} />
      {file && <div className="truncate rounded border p-2 text-sm">{file}</div>}
      <div className="space-y-1">
        <label className="text-sm text-[var(--color-muted)]">
          Pages (e.g. <code>1,3,5-7</code>)
        </label>
        <Input
          type="text"
          value={pageInput}
          onChange={(e) => setPageInput(e.target.value)}
          placeholder="1,3,5-7"
        />
        {!valid && pageInput.length > 0 && (
          <p className="text-xs text-red-600">Invalid page list.</p>
        )}
      </div>
      <div className="flex gap-2">
        <Button disabled={!file || !valid || !!activeId} onClick={onRun}>
          {t("ok")}
        </Button>
        {activeId && (
          <Button variant="outline" onClick={cancelActive}>
            {t("cancel")}
          </Button>
        )}
      </div>
      <ProgressList />
    </ToolPage>
  );
}
