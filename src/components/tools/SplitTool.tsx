import { open } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileDropzone } from "@/components/FileDropzone";
import { ProgressList } from "@/components/ProgressList";
import { ToolPage } from "@/components/ToolPage";
import { useToolJob } from "@/hooks/useToolJob";

interface RangeRow {
  from: number;
  to: number;
}

export function SplitTool() {
  const { t } = useTranslation();
  const [file, setFile] = useState<string | null>(null);
  const [ranges, setRanges] = useState<RangeRow[]>([{ from: 1, to: 1 }]);
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
          ranges: ranges.map((r) => [r.from, r.to]),
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
      description="Split a PDF into multiple files by page ranges."
    >
      <FileDropzone onFiles={(p) => setFile(p[0] ?? null)} multiple={false} />
      {file && <div className="truncate rounded border p-2 text-sm">{file}</div>}
      <div className="space-y-2">
        {ranges.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              value={r.from}
              className="w-24"
              onChange={(e) =>
                setRanges((rs) =>
                  rs.map((x, j) => (j === i ? { ...x, from: Number(e.target.value) } : x)),
                )
              }
            />
            <span>–</span>
            <Input
              type="number"
              min={1}
              value={r.to}
              className="w-24"
              onChange={(e) =>
                setRanges((rs) =>
                  rs.map((x, j) => (j === i ? { ...x, to: Number(e.target.value) } : x)),
                )
              }
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRanges((rs) => rs.filter((_, j) => j !== i))}
              disabled={ranges.length <= 1}
            >
              {t("delete")}
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setRanges((rs) => [...rs, { from: 1, to: 1 }])}
        >
          + Range
        </Button>
      </div>
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
