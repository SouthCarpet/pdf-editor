// Second-level toggle inside Workspace when activeTool === "edit".
//
// Lets the user switch between Forms / Annotations / Text panels. Forms is
// the default because AcroForm fill is the safest of the three.
import type { EditSubTool } from "@/stores/workspaceStore";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

interface Props {
  value: EditSubTool;
  onChange: (v: EditSubTool) => void;
}

const OPTIONS: { id: EditSubTool; labelKey: string }[] = [
  { id: "forms", labelKey: "tools.edit_forms" },
  { id: "annotations", labelKey: "tools.edit_annotations" },
  { id: "text", labelKey: "tools.edit_text" },
];

export function EditSubToolToggle({ value, onChange }: Props) {
  const { t } = useTranslation("workspace");
  return (
    <div className="flex gap-1 rounded border border-[var(--color-border)] p-1">
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            "flex-1 rounded px-2 py-1 text-xs",
            value === o.id
              ? "bg-[var(--color-accent)] text-[var(--color-accent-foreground)]"
              : "hover:bg-[var(--color-control-hover)]"
          )}
        >
          {t(o.labelKey)}
        </button>
      ))}
    </div>
  );
}
