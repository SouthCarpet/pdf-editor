import { open } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { FileDropzone } from "@/components/FileDropzone";
import { ProgressList } from "@/components/ProgressList";
import { ToolPage } from "@/components/ToolPage";
import { useToolJob } from "@/hooks/useToolJob";
import {
  DEFAULT_SPLIT_OPTIONS,
  SplitOptions,
  type SplitOptionsValue,
} from "./options/SplitOptions";

export function SplitTool() {
  const { t } = useTranslation();
  const [file, setFile] = useState<string | null>(null);
  const [options, setOptions] = useState<SplitOptionsValue>(DEFAULT_SPLIT_OPTIONS);
  const { run, cancelActive, activeId } = useToolJob("split");

  async function onRun() {
    if (!file) return;
    const dir = await open({ directory: true, multiple: false });
    if (!dir || Array.isArray(dir)) return;
    await run(
      "split_pdf_cmd",
      {
        args: {
          input: file,
          ranges: options.ranges.map((r) => [r.from, r.to]),
          outDir: dir,
          jobId: "",
        },
      },
      [file],
    ).catch(() => {});
  }

  return (
    <ToolPage
      title={t("tools.split")}
      description={t("tools:split.description")}
    >
      <FileDropzone onFiles={(p) => setFile(p[0] ?? null)} multiple={false} />
      {file && <div className="truncate rounded border p-2 text-sm">{file}</div>}
      <SplitOptions value={options} onChange={setOptions} mode="standalone" />
      <div className="flex gap-2">
        <Button disabled={!file || !!activeId} onClick={onRun}>
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
