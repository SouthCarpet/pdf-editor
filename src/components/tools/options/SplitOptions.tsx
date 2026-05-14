// Delta U: reusable Split options panel.
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface SplitOptionsValue {
  ranges: Array<{ from: number; to: number }>;
}

export const DEFAULT_SPLIT_OPTIONS: SplitOptionsValue = {
  ranges: [{ from: 1, to: 1 }],
};

interface Props {
  value: SplitOptionsValue;
  onChange: (next: SplitOptionsValue) => void;
  mode?: "standalone" | "pipeline-node";
}

export function SplitOptions({ value, onChange }: Props) {
  const ranges = value.ranges;
  function setRanges(next: SplitOptionsValue["ranges"]) {
    onChange({ ranges: next });
  }
  return (
    <div className="space-y-2">
      {ranges.map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            type="number"
            min={1}
            value={r.from}
            className="w-24"
            onChange={(e) =>
              setRanges(
                ranges.map((x, j) =>
                  j === i ? { ...x, from: Number(e.target.value) } : x,
                ),
              )
            }
          />
          <span>-</span>
          <Input
            type="number"
            min={1}
            value={r.to}
            className="w-24"
            onChange={(e) =>
              setRanges(
                ranges.map((x, j) =>
                  j === i ? { ...x, to: Number(e.target.value) } : x,
                ),
              )
            }
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setRanges(ranges.filter((_, j) => j !== i))}
            disabled={ranges.length <= 1}
          >
            Remove
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        onClick={() => setRanges([...ranges, { from: 1, to: 1 }])}
      >
        + Range
      </Button>
    </div>
  );
}
