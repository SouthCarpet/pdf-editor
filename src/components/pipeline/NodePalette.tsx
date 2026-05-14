// Phase 14 Task 75 — Pipeline NodePalette.
//
// Left sidebar with one row per registered NodeKind grouped by category.
// Click "Add" to insert a default-config node into the canvas.
import { Button } from "@/components/ui/button";
import { NODE_KINDS, type NodeKindMeta } from "@/pipeline/nodeKinds";

interface Props {
  onAdd: (kind: NodeKindMeta) => void;
}

const GROUP_LABELS: Record<NodeKindMeta["category"], string> = {
  input: "Input",
  modify: "Modify",
  convert: "Convert",
  output: "Output",
};

const ORDER: NodeKindMeta["category"][] = [
  "input",
  "modify",
  "convert",
  "output",
];

export function NodePalette({ onAdd }: Props) {
  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto border-r border-[var(--color-border)] bg-[var(--color-card)] p-3">
      <h2 className="text-sm font-semibold">Nodes</h2>
      {ORDER.map((cat) => {
        const items = NODE_KINDS.filter((k) => k.category === cat);
        if (items.length === 0) return null;
        return (
          <div key={cat} className="space-y-1">
            <h3 className="text-xs uppercase tracking-wide text-[var(--color-muted)]">
              {GROUP_LABELS[cat]}
            </h3>
            {items.map((k) => (
              <Button
                key={k.key}
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={() => onAdd(k)}
              >
                {k.label}
              </Button>
            ))}
          </div>
        );
      })}
    </div>
  );
}
