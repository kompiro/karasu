/* shadcn/ui Button — adapted from https://ui.shadcn.com/docs/components/button
 * Issue #1368. Variants are karasu-specific: they encode the two toolbar
 * button tiers from ADR-20260405-02 (toolbar-btn--actionable) rather than
 * shadcn's generic default/secondary/destructive set.
 *
 *   variant="actionable" — Tier 1: persistent actions the user should notice
 *   variant="ghost"      — Tier 2: low-priority / contextual actions
 *
 * Every button still needs an icon + text label (ADR-20260328 label rule);
 * that is a caller responsibility, not enforced here. */

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // `aria-pressed:` styling gives toggle buttons (Icon Mode, Focus, …) the
  // active look — callers should set aria-pressed on toggles for a11y.
  "inline-flex items-center gap-1 whitespace-nowrap rounded-sm border font-medium tracking-[0.01em] transition-all disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] aria-pressed:border-[color:rgba(77,143,255,0.3)] aria-pressed:bg-[color:var(--accent-dim)] aria-pressed:text-[color:var(--accent-hover)]",
  {
    variants: {
      variant: {
        actionable:
          "border-[color:var(--border-strong)] bg-[color:var(--bg-raised)] text-[color:var(--text-secondary)] hover:border-[color:rgba(77,143,255,0.4)] hover:bg-[color:var(--accent-dim)] hover:text-[color:var(--accent-hover)]",
        ghost:
          "border-transparent bg-transparent text-[color:var(--text-muted)] hover:border-[color:var(--border-default)] hover:bg-[color:var(--bg-raised)] hover:text-[color:var(--text-primary)]",
      },
      size: {
        sm: "px-[9px] py-[3px] text-[11px]",
        md: "px-[14px] py-[6px] text-[12px]",
      },
    },
    defaultVariants: {
      variant: "ghost",
      size: "sm",
    },
  },
);

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";

export { Button };
