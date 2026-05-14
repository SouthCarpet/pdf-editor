// Delta U: reusable Convert Import options panel.
//
// Convert-import has no per-tool options beyond the input file list,
// so this panel renders a hint only. The standalone tool collects the
// input files; the pipeline-node config has none beyond receiving the
// upstream node's outputs.
interface Props {
  mode?: "standalone" | "pipeline-node";
}

export function ConvertImportOptions({ mode = "standalone" }: Props) {
  return (
    <div className="rounded border p-3 text-sm text-[var(--color-muted)]">
      {mode === "pipeline-node"
        ? "Converts upstream non-PDF inputs (images, office docs) into PDFs via LibreOffice. No extra options."
        : "Drop images or office files. They will be merged into a single PDF via LibreOffice."}
    </div>
  );
}
