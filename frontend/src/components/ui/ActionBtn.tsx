import * as React from "react";
import { Slot } from "@radix-ui/react-slot";

import { cn } from "@/lib/utils";

type ActionTone = "primary" | "secondary" | "ghost";

export interface ActionBtnProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: ActionTone;
  asChild?: boolean;
}

const toneClasses: Record<ActionTone, string> = {
  primary: "bg-primary text-black hover:brightness-90",
  secondary: "bg-secondary text-white hover:brightness-90",
  ghost: "border border-border text-foreground hover:bg-muted",
};

const ActionBtn = React.forwardRef<HTMLButtonElement, ActionBtnProps>(
  ({ className, tone = "primary", asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";

    return (
      <Comp
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-sm border border-transparent px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
          toneClasses[tone],
          className
        )}
        {...props}
      />
    );
  }
);

ActionBtn.displayName = "ActionBtn";

export { ActionBtn };
