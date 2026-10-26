// Delta U: reusable Merge options panel.
//
// Merge has no parameters beyond the input file list. In a pipeline node
// the upstream inputs are the merge sources, so this panel renders an
// informational hint.
interface Props {
  mode?: "standalone" | "pipeline-node";
}

export function MergeOptions({ mode = "standalone" }: Props) {
  return (
    <p className="k-caption">
      {mode === "pipeline-node"
        ? "Merges every upstream PDF into one. No extra options."
        : "Add multiple PDFs above. They will be merged in the listed order."}
    </p>
  );
}
