"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value = 0, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "relative h-2 w-full overflow-hidden rounded-full bg-zinc-800",
        className
      )}
      {...props}
    >
      <div
        className="h-full bg-green-500 transition-all duration-700 ease-out"
        style={{ 
          width: `${Math.min(Math.max(value, 0), 100)}%`,
          transition: "width 700ms cubic-bezier(0.4, 0, 0.2, 1)"
        }}
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
      />
    </div>
  )
)
Progress.displayName = "Progress"

export { Progress }
