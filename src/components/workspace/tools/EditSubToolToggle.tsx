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
    <div className="grid grid-cols-2 gap-1 border-b border-[var(--color-border)] pb-[var(--space-2)]">
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            "k-btn k-btn-ghost px-2 text-[length:var(--text-sm)]",
            value === o.id
              ? "bg-[var(--color-surface-selected)] font-bold text-[var(--color-text)]"
              : "hover:bg-[var(--color-surface-hover)]"
          )}
        >
          {t(o.labelKey)}
        </button>
      ))}
    </div>
  );
}
