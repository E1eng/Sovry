"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export interface TooltipProps {
  content: string
  children: React.ReactNode
  className?: string
}

export function Tooltip({ content, children, className }: TooltipProps) {
  const [isVisible, setIsVisible] = React.useState(false)

  return (
    <div
      className={cn("relative inline-block", className)}
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      {isVisible && (
        <div
          className="absolute z-50 px-2 py-1 text-xs font-medium text-white bg-zinc-900 rounded-md shadow-lg border border-zinc-800 whitespace-nowrap pointer-events-none"
          style={{
            bottom: "100%",
            left: "50%",
            transform: "translateX(-50%)",
            marginBottom: "8px",
          }}
        >
          {content}
          <div
            className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-zinc-900"
            style={{ marginTop: "-1px" }}
          />
        </div>
      )}
    </div>
  )
}



