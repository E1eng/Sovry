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
          className="flex flex-col items-start gap-4 sm:gap-6"
          style={{
            animation: `fadeIn 0.5s ease-out ${delay}ms both`,
          }}
        >
          {/* Token Image Skeleton */}
          <Skeleton className="w-20 h-20 rounded-xl flex-shrink-0" />

          {/* Token Info Skeleton */}
          <div className="flex-1 min-w-0 w-full space-y-3">
            {/* Ticker and Badge */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
              <Skeleton className="h-8 sm:h-9 w-32" />
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>

            {/* Name */}
            <Skeleton className="h-4 sm:h-5 w-48" />

            {/* Creator Address */}
            <Skeleton className="h-4 w-40" />

            {/* Contract Address */}
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-32 rounded-lg" />
              <Skeleton className="h-6 w-6 rounded" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}


