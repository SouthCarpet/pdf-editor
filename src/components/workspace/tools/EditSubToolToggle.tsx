// Phase 12 — second-level toggle inside Workspace when activeTool === "edit".
//
// Lets the user switch between Forms / Annotations / Text panels. Forms is
// the default because AcroForm fill is the safest of the three.
import type { EditSubTool } from "@/stores/workspaceStore";
import { cn } from "@/lib/utils";

interface Props {
  value: EditSubTool;
  onChange: (v: EditSubTool) => void;
}

const OPTIONS: { id: EditSubTool; label: string }[] = [
  { id: "forms", label: "Forms" },
  { id: "annotations", label: "Annotations" },
  { id: "text", label: "Text" },
];

export function EditSubToolToggle({ value, onChange }: Props) {
  return (
    <div className="flex gap-1 rounded border border-[var(--color-border)] p-1">
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            "flex-1 rounded px-2 py-1 text-xs",
            value === o.id
              ? "bg-blue-500 text-white"
              : "hover:bg-neutral-100 dark:hover:bg-neutral-800",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
