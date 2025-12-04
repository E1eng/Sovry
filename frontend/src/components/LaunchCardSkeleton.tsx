"use client"

import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

export interface LaunchCardSkeletonProps {
  className?: string
}

export function LaunchCardSkeleton({ className }: LaunchCardSkeletonProps) {
  return (
    <div
      className={cn(
        "relative flex h-full items-start gap-4 overflow-hidden",
        "rounded-xl border border-zinc-800/80 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950",
        "px-4 py-3 sm:px-5 sm:py-4",
        className
      )}
    >
      {/* Left - Thumbnail skeleton */}
      <div className="relative h-16 w-16 sm:h-20 sm:w-20 rounded-lg overflow-hidden bg-zinc-900/80 flex-shrink-0">
        <Skeleton className="absolute inset-0 w-full h-full" />
      </div>

      {/* Right - Content skeleton */}
      <div className="flex-1 min-w-0 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0 flex-1">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-16" />
          </div>
          <Skeleton className="h-4 w-20 rounded-full" />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-10" />
          </div>
          <Skeleton className="h-1.5 w-full rounded-full" />
        </div>
      </div>
    </div>
  )
}

