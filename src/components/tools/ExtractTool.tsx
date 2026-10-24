import { pickSavePath } from "@/tauri/bridge";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { FileDropzone } from "@/components/FileDropzone";
import { ProgressList } from "@/components/ProgressList";
import { ToolPage } from "@/components/ToolPage";
import { SelectedFile } from "./SelectedFiles";
import { useToolJob } from "@/hooks/useToolJob";
import { parsePageList } from "@/lib/parsePageList";
import {
  DEFAULT_EXTRACT_OPTIONS,
  ExtractOptions,
  type ExtractOptionsValue,
} from "./options/ExtractOptions";

const MAX_PAGE_HINT = 100000;

export function ExtractTool() {
  const { t } = useTranslation();
  const [file, setFile] = useState<string | null>(null);
  const [options, setOptions] = useState<ExtractOptionsValue>(DEFAULT_EXTRACT_OPTIONS);
  const { run, cancelActive, activeId } = useToolJob("extract");

  const pages = useMemo(() => parsePageList(options.pageInput, MAX_PAGE_HINT), [options.pageInput]);
  const valid = pages !== null && pages.length > 0;

  async function onRun() {
    if (!file || !pages) return;
    const out = await pickSavePath({
      filters: [{ name: "PDF", extensions: ["pdf"] }],
      defaultPath: "extracted.pdf",
    });
    if (!out) return;
    await run("extract_pages_cmd", { args: { input: file, pages, output: out, jobId: "" } }, [
      file,
    ]).catch(() => {});
  }

  return (
    <ToolPage title={t("tools.extract")} description={t("tools:extract.description")}>
      <FileDropzone onFiles={(p) => setFile(p[0] ?? null)} multiple={false} />
      {file && <SelectedFile path={file} />}
      <ExtractOptions value={options} onChange={setOptions} mode="standalone" />
      <div className="flex gap-2">
        <Button disabled={!file || !valid || !!activeId} onClick={onRun}>
          {t("tools:extract.run")}
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
