"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

export interface TokenHeaderSkeletonProps {
  className?: string
  delay?: number
}

export function TokenHeaderSkeleton({ className, delay = 0 }: TokenHeaderSkeletonProps) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className="p-4 sm:p-6">
        <div
          className="flex flex-row flex-wrap items-start sm:items-center gap-4 sm:gap-6"
          style={{
            animation: `fadeIn 0.5s ease-out ${delay}ms both`,
          }}
        >
          {/* Token Image Skeleton */}
          <Skeleton className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-2xl flex-shrink-0" />

          {/* Token Info Skeleton */}
          <div className="flex-1 min-w-0">
            {/* Ticker and Badge */}
            <div className="flex items-start justify-between gap-2 sm:gap-3 mb-2">
              <div className="min-w-0 space-y-2">
                {/* Name */}
                <Skeleton className="h-6 sm:h-8 w-48" />
                <div className="mt-1 inline-flex items-center gap-2">
                  <Skeleton className="h-6 w-20 rounded-full" />
                </div>
              </div>
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>

            {/* Creator Address */}
            <div className="flex items-center gap-2 mb-3">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-32" />
            </div>

            {/* Contract Address */}
            <div className="flex items-center gap-2 flex-wrap">
              <Skeleton className="h-8 w-40 rounded-lg" />
              <div className="flex items-center gap-2">
                <Skeleton className="h-6 w-6 rounded-full" />
                <Skeleton className="h-6 w-6 rounded-full" />
                <Skeleton className="h-6 w-6 rounded-full" />
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}


