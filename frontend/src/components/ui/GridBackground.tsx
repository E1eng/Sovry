import * as React from "react";

import { cn } from "@/lib/utils";

interface GridBackgroundProps extends React.HTMLAttributes<HTMLDivElement> {
  columns?: number;
}

const GridBackground = React.forwardRef<HTMLDivElement, GridBackgroundProps>(
  ({ columns = 6, className, children, ...props }, ref) => (
    <div ref={ref} className={cn("relative overflow-hidden", className)} {...props}>
      <div
        className="pointer-events-none absolute inset-0 grid"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: columns }).map((_, index) => (
          <div
            key={`grid-col-${index}`}
            className="border-r border-white/5 last:border-r-0"
          />
        ))}
      </div>
      <div className="relative">{children}</div>
    </div>
  )
);

GridBackground.displayName = "GridBackground";

export { GridBackground };
