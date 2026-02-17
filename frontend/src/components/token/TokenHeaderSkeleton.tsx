"use client"

import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

export interface TokenHeaderSkeletonProps {
  className?: string
  delay?: number
}

export function TokenHeaderSkeleton({ className, delay = 0 }: TokenHeaderSkeletonProps) {
  return (
    <div
      className={cn("border border-border bg-card rounded-sm overflow-hidden", className)}
      style={{
        animation: `fadeIn 0.5s ease-out ${delay}ms both`,
      }}
    >
      <div className="relative px-4 py-4 sm:px-5">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(520px_circle_at_top_left,_rgba(204,255,0,0.12),_transparent_65%)]" />
        <div className="relative flex flex-wrap items-center gap-4">
          <Skeleton className="h-12 w-12 sm:h-14 sm:w-14 rounded-sm flex-shrink-0" />
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Skeleton className="h-5 sm:h-6 w-44" />
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-16" />
            </div>
            <Skeleton className="h-4 w-36" />
          </div>
          <div className="flex items-center gap-1">
            <Skeleton className="h-7 w-7 rounded-sm" />
            <Skeleton className="h-7 w-7 rounded-sm" />
            <Skeleton className="h-7 w-7 rounded-sm" />
          </div>
        </div>
      </div>
      <div className="border-t border-border bg-muted/30 px-4 py-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-4 w-16 rounded-sm" />
          <Skeleton className="h-4 w-20 rounded-sm" />
          <Skeleton className="h-4 w-24 rounded-sm" />
        </div>
        <Skeleton className="h-4 w-16" />
      </div>
    </div>
  )
}


