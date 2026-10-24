// Delta U: reusable Organize options panels. Organize spans four
// related operations (rotate, delete, reorder, insert blank); the
// pipeline NodeConfigPanel uses one component per variant so the panel
// dispatches cleanly.
//
// In the workspace, the OrganizePanel drives these via thumbnail clicks
// + selections; the pipeline editor surface here is text-driven (page
// number lists) because there is no preview canvas inside a node.
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { TextField } from "./fields";
import type {
  RotateOptionsValue,
  DeletePagesOptionsValue,
  ReorderOptionsValue,
  InsertBlankOptionsValue,
} from "./defaults";

type Mode = "standalone" | "pipeline-node";

interface RotateProps {
  value: RotateOptionsValue;
  onChange: (next: RotateOptionsValue) => void;
  mode?: Mode;
}

export function RotatePagesOptions({ value, onChange, mode = "standalone" }: RotateProps) {
  const { t } = useTranslation("tools");
  return (
    <div className="space-y-4">
      <p className="k-caption">{t("organize.rotate_hint")}</p>
      <Input
        type="text"
        value={value.rotations.map(([p, a]) => `${p}:${a}`).join(", ")}
        onChange={(e) => {
          const parsed: Array<[number, number]> = e.target.value
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
            .map((tok) => {
              const [p, a] = tok.split(":").map(Number);
              return [p, a] as [number, number];
            })
            .filter(([p, a]) => Number.isFinite(p) && Number.isFinite(a));
          onChange({ rotations: parsed });
        }}
        placeholder={t("organize.rotate_placeholder")}
      />
      {mode === "standalone" && (
        <p className="k-caption">
          Tip: rotate selected thumbnails in the workspace for click-driven editing.
        </p>
      )}
    </div>
  );
}

interface DeletePagesProps {
  value: DeletePagesOptionsValue;
  onChange: (next: DeletePagesOptionsValue) => void;
  mode?: Mode;
}

export function DeletePagesOptions({ value, onChange }: DeletePagesProps) {
  const { t } = useTranslation("tools");
  return (
    <div className="space-y-4">
      <p className="k-caption">{t("organize.delete_hint")}</p>
      <Input
        type="text"
        value={value.pages.join(", ")}
        onChange={(e) => {
          const parsed = e.target.value
            .split(",")
            .map((s) => Number(s.trim()))
            .filter((n) => Number.isFinite(n) && n > 0);
          onChange({ pages: parsed });
        }}
        placeholder={t("organize.delete_placeholder")}
      />
    </div>
  );
}

interface ReorderProps {
  value: ReorderOptionsValue;
  onChange: (next: ReorderOptionsValue) => void;
  mode?: Mode;
}

export function ReorderPagesOptions({ value, onChange }: ReorderProps) {
  const { t } = useTranslation("tools");
  return (
    <div className="space-y-4">
      <p className="k-caption">{t("organize.reorder_hint")}</p>
      <Input
        type="text"
        value={value.new_order.join(", ")}
        onChange={(e) => {
          const parsed = e.target.value
            .split(",")
            .map((s) => Number(s.trim()))
            .filter((n) => Number.isFinite(n) && n > 0);
          onChange({ new_order: parsed });
        }}
        placeholder={t("organize.reorder_placeholder")}
      />
    </div>
  );
}

interface InsertBlankProps {
  value: InsertBlankOptionsValue;
  onChange: (next: InsertBlankOptionsValue) => void;
  mode?: Mode;
}

export function InsertBlankOptions({ value, onChange }: InsertBlankProps) {
  return (
    <div className="space-y-4">
      <TextField label="After page index (0-based)">
        <Input
          type="number"
          min={0}
          value={value.after_page_index}
          onChange={(e) =>
            onChange({ ...value, after_page_index: Number(e.target.value) })
          }
        />
      </TextField>
      <TextField label="Width (pt)">
        <Input
          type="number"
          min={1}
          value={value.width}
          onChange={(e) => onChange({ ...value, width: Number(e.target.value) })}
        />
      </TextField>
      <TextField label="Height (pt)">
        <Input
          type="number"
          min={1}
          value={value.height}
          onChange={(e) =>
            onChange({ ...value, height: Number(e.target.value) })
          }
        />
      </TextField>
    </div>
  );
}
