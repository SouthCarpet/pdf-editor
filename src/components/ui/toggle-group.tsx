// shadcn-style ToggleGroup wrapping @radix-ui/react-toggle-group. Used for
// B/I/U/S typography toggles, text alignment, edit sub-tool selection.
import * as React from "react";
import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";
import { cn } from "@/lib/utils";

const ToggleGroup = React.forwardRef<
  React.ElementRef<typeof ToggleGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Root>
>(({ className, ...props }, ref) => (
  <ToggleGroupPrimitive.Root
    ref={ref}
    className={cn(
      "inline-flex items-center gap-0.5 rounded-[var(--radius-md)] border border-[var(--color-border)] p-0.5",
      className,
    )}
    {...props}
  />
));
ToggleGroup.displayName = ToggleGroupPrimitive.Root.displayName;

const ToggleGroupItem = React.forwardRef<
  React.ElementRef<typeof ToggleGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <ToggleGroupPrimitive.Item
    ref={ref}
    className={cn(
      "inline-flex h-7 min-w-7 items-center justify-center rounded-[var(--radius-sm)] px-2 text-xs transition-colors",
      "hover:bg-[var(--color-surface-hover)]",
      "data-[state=on]:bg-[var(--color-surface-selected)] data-[state=on]:font-bold data-[state=on]:text-[var(--color-text)]",
      "outline-2 outline-offset-2 outline-transparent focus-visible:outline-[var(--color-focus)]",
      "disabled:pointer-events-none disabled:text-[var(--color-text-muted)]",
      className,
    )}
    {...props}
  >
    {children}
  </ToggleGroupPrimitive.Item>
));
ToggleGroupItem.displayName = ToggleGroupPrimitive.Item.displayName;

export { ToggleGroup, ToggleGroupItem };
