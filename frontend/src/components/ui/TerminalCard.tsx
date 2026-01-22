import * as React from "react";

import { cn } from "@/lib/utils";

const TerminalCard = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("rounded-sm border border-border bg-card text-foreground", className)}
    {...props}
  />
));

TerminalCard.displayName = "TerminalCard";

export { TerminalCard };
