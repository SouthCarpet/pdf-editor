// Delta U: reusable Extract options panel.
import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { parsePageList } from "@/lib/parsePageList";

const MAX_PAGE_HINT = 100000;

export interface ExtractOptionsValue {
  pageInput: string;
}

export const DEFAULT_EXTRACT_OPTIONS: ExtractOptionsValue = {
  pageInput: "1",
};

interface Props {
  value: ExtractOptionsValue;
  onChange: (next: ExtractOptionsValue) => void;
  mode?: "standalone" | "pipeline-node";
}

export function ExtractOptions({ value, onChange }: Props) {
  const pages = useMemo(
    () => parsePageList(value.pageInput, MAX_PAGE_HINT),
    [value.pageInput],
  );
  const valid = pages !== null && pages.length > 0;
  return (
    <div className="space-y-1">
      <label className="text-sm text-[var(--color-muted)]">
        Pages (e.g. <code>1,3,5-7</code>)
      </label>
      <Input
        type="text"
        value={value.pageInput}
        onChange={(e) => onChange({ pageInput: e.target.value })}
        placeholder="1,3,5-7"
      />
      {!valid && value.pageInput.length > 0 && (
        <p className="text-xs text-red-600">Invalid page list.</p>
      )}
    </div>
  );
}
