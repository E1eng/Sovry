"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

export interface LaunchCardSkeletonProps {
  className?: string
}

export function LaunchCardSkeleton({ className }: LaunchCardSkeletonProps) {
  return (
    <Card
      className={cn(
        "overflow-hidden rounded-xl border shadow-sm grid grid-rows-2 h-full min-h-[400px]",
        className
      )}
    >
      {/* Top 50% - Image Skeleton */}
      <div className="relative w-full h-full bg-zinc-800 overflow-hidden flex items-center justify-center">
        <div className="relative w-full aspect-square h-full max-h-full">
          <Skeleton className="absolute inset-0 w-full h-full" />
        </div>
      </div>

      {/* Bottom 50% - Content Skeleton */}
      <CardContent className="p-4 sm:p-6 space-y-3 sm:space-y-4 flex flex-col justify-between h-full">
        <div className="space-y-3">
          {/* Ticker Symbol Skeleton */}
          <Skeleton className="h-8 w-24" />

          {/* Market Cap Badge Skeleton */}
          <Skeleton className="h-6 w-32 rounded-full" />
        </div>

        <div className="space-y-2">
          {/* Created By Skeleton */}
          <div className="pt-2 border-t border-zinc-800">
            <Skeleton className="h-3 w-40" />
          </div>

          {/* Bonding Curve Progress Skeleton */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3 w-12" />
            </div>
            <Skeleton className="h-2 w-full rounded-full" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

