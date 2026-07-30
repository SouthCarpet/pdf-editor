// ColorPicker (Delta U) — wraps react-colorful's HexAlphaColorPicker inside
// a Popover. Supports an optional "transparent" sentinel value and a
// per-tool recent-colors row backed by localStorage.
import { useState } from "react";
import { HexAlphaColorPicker, HexColorInput } from "react-colorful";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getRecentColors, pushRecentColor } from "@/lib/recentColors";

interface ColorPickerProps {
  value: string;
  onChange: (next: string) => void;
  allowTransparent?: boolean;
  label?: string;
  /** Optional per-tool key for the recent-colors row. */
  toolKey?: string;
}

export function ColorPicker({
  value,
  onChange,
  allowTransparent,
  label,
  toolKey,
}: ColorPickerProps) {
  const [open, setOpen] = useState(false);
  const recents = toolKey ? getRecentColors(toolKey) : [];

  const handleCommit = (next: string) => {
    onChange(next);
    if (toolKey && next !== "transparent") pushRecentColor(toolKey, next);
  };

  return (
    <div className="flex items-center gap-2">
      {label && (
        <span className="text-xs text-[var(--color-muted)]">{label}</span>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="h-7 w-10 rounded border border-[var(--color-border)] shadow-sm"
            style={{
              background:
                value === "transparent"
                  ? "repeating-conic-gradient(#ccc 0 25%, #fff 0 50%) 0/8px 8px"
                  : value,
            }}
            aria-label={`Pick ${label ?? "color"}`}
          />
        </PopoverTrigger>
        <PopoverContent className="w-56 space-y-2 p-2">
          <HexAlphaColorPicker
            color={value === "transparent" ? "#00000000" : value}
            onChange={(c) => onChange(c)}
            onMouseUp={() => handleCommit(value)}
          />
          <HexColorInput
            color={value === "transparent" ? "#000000" : value}
            onChange={(c) => handleCommit(c)}
            prefixed
            className="block w-full rounded border border-[var(--color-border)] bg-[var(--color-card)] p-1 text-sm"
          />
          {recents.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {recents.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => handleCommit(c)}
                  className="h-5 w-5 rounded border border-[var(--color-border)]"
                  style={{ background: c }}
                  aria-label={`Use ${c}`}
                />
              ))}
            </div>
          )}
          {allowTransparent && (
            <button
              type="button"
              onClick={() => onChange("transparent")}
              className="block w-full rounded border border-[var(--color-border)] p-1 text-xs hover:bg-[var(--color-control-hover)]"
            >
              No fill (transparent)
            </button>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
