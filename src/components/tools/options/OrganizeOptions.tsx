// Delta U: reusable Organize options panels. Organize spans four
// related operations (rotate, delete, reorder, insert blank); the
// pipeline NodeConfigPanel uses one component per variant so the panel
// dispatches cleanly.
//
// In the workspace, the OrganizePanel drives these via thumbnail clicks
// + selections; the pipeline editor surface here is text-driven (page
// number lists) because there is no preview canvas inside a node.
import { Input } from "@/components/ui/input";

export interface RotateOptionsValue {
  rotations: Array<[number, number]>;
}

export const DEFAULT_ROTATE_OPTIONS: RotateOptionsValue = { rotations: [] };

export interface DeletePagesOptionsValue {
  pages: number[];
}

export const DEFAULT_DELETE_PAGES_OPTIONS: DeletePagesOptionsValue = {
  pages: [],
};

export interface ReorderOptionsValue {
  new_order: number[];
}

export const DEFAULT_REORDER_OPTIONS: ReorderOptionsValue = { new_order: [] };

export interface InsertBlankOptionsValue {
  after_page_index: number;
  width: number;
  height: number;
}

export const DEFAULT_INSERT_BLANK_OPTIONS: InsertBlankOptionsValue = {
  after_page_index: 0,
  width: 612,
  height: 792,
};

type Mode = "standalone" | "pipeline-node";

interface RotateProps {
  value: RotateOptionsValue;
  onChange: (next: RotateOptionsValue) => void;
  mode?: Mode;
}

export function RotatePagesOptions({ value, onChange, mode = "standalone" }: RotateProps) {
  return (
    <div className="space-y-2 rounded border p-3 text-sm">
      <p className="text-[var(--color-muted)]">
        Rotations as comma-separated <code>page:angle</code> pairs. Angles are
        0, 90, 180, 270 (degrees clockwise).
      </p>
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
        placeholder="1:90, 3:180"
      />
      {mode === "standalone" && (
        <p className="text-xs text-[var(--color-muted)]">
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
  return (
    <div className="space-y-2 rounded border p-3 text-sm">
      <p className="text-[var(--color-muted)]">
        Page numbers to delete (1-based, comma-separated).
      </p>
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
        placeholder="2, 4, 6"
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
  return (
    <div className="space-y-2 rounded border p-3 text-sm">
      <p className="text-[var(--color-muted)]">
        New page order as comma-separated 1-based indices. Must cover every
        existing page exactly once.
      </p>
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
        placeholder="3, 1, 2, 4"
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
    <div className="space-y-2 rounded border p-3 text-sm">
      <label className="block">
        After page index (0-based):
        <Input
          type="number"
          min={0}
          value={value.after_page_index}
          onChange={(e) =>
            onChange({ ...value, after_page_index: Number(e.target.value) })
          }
        />
      </label>
      <label className="block">
        Width (pt):
        <Input
          type="number"
          min={1}
          value={value.width}
          onChange={(e) => onChange({ ...value, width: Number(e.target.value) })}
        />
      </label>
      <label className="block">
        Height (pt):
        <Input
          type="number"
          min={1}
          value={value.height}
          onChange={(e) =>
            onChange({ ...value, height: Number(e.target.value) })
          }
        />
      </label>
    </div>
  );
}
