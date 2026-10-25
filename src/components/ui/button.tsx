/* eslint-disable react-refresh/only-export-components */
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/** The secondary button uses the strong border role. */
const EDGE = "border-[var(--color-border-strong)]";

const buttonVariants = cva(
  "k-btn k-btn-auto inline-flex items-center justify-center whitespace-nowrap disabled:pointer-events-none",
  {
    variants: {
      variant: {
        default: "k-btn-primary",
        outline: `k-btn-secondary ${EDGE}`,
        ghost: "k-btn-ghost",
        destructive: "k-btn-danger",
      },
      size: {
        default: "",
        sm: "h-7 px-3",
        lg: "h-10 px-6",
        icon: "w-8 px-0",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  }
);
Button.displayName = "Button";

export { buttonVariants };
