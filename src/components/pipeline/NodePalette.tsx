// Phase 14 Task 75: Pipeline NodePalette.
//
// Left sidebar with one row per registered NodeKind grouped by category.
// Click "Add" to insert a default-config node into the canvas.
import { Button } from "@/components/ui/button";
import { NODE_KINDS, type NodeKindMeta } from "@/pipeline/nodeKinds";
import { translateNodeLabel } from "@/pipeline/nodeLabels";
import { useTranslation } from "react-i18next";

interface Props {
  onAdd: (kind: NodeKindMeta) => void;
}

const ORDER: NodeKindMeta["category"][] = ["input", "modify", "convert", "output"];

function groupLabel(t: ReturnType<typeof useTranslation>["t"], category: NodeKindMeta["category"]) {
  switch (category) {
    case "input":
      return t("categories.input");
    case "modify":
      return t("categories.modify");
    case "convert":
      return t("categories.convert");
    case "output":
      return t("categories.output");
  }
}

export function NodePalette({ onAdd }: Props) {
  const { t } = useTranslation("pipeline");

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto border-r border-[var(--color-border)] bg-[var(--color-card)] p-3">
      <h2 className="text-sm font-semibold">{t("node_palette")}</h2>
      {ORDER.map((cat) => {
        const items = NODE_KINDS.filter((k) => k.category === cat);
        if (items.length === 0) return null;
        return (
          <div key={cat} className="space-y-1">
            <h3 className="text-xs tracking-wide text-[var(--color-muted)] uppercase">
              {groupLabel(t, cat)}
            </h3>
            {items.map((k) => (
              <Button
                key={k.key}
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={() => onAdd(k)}
              >
                {translateNodeLabel(t, k.key)}
              </Button>
            ))}
          </div>
        );
      })}
    </div>
  );
}
