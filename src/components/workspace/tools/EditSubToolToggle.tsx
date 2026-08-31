// Second-level toggle inside Workspace when activeTool === "edit".
//
// Lets the user switch between Forms / Annotations / Text / Signature panels. Forms is
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
  { id: "signature", labelKey: "tools.edit_signature" },
];

export function EditSubToolToggle({ value, onChange }: Props) {
  const { t } = useTranslation("workspace");
  return (
    <div className="grid grid-cols-2 gap-1 rounded-md border border-[var(--color-border)] p-1">
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            "min-h-10 rounded px-2 py-1 text-xs transition-[scale,background-color,color] duration-150 ease-out active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] focus-visible:ring-offset-2",
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
