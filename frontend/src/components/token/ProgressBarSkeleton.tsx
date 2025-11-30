"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

export interface ProgressBarSkeletonProps {
  className?: string
  delay?: number
}

export function ProgressBarSkeleton({ className, delay = 300 }: ProgressBarSkeletonProps) {
  return (
    <Card 
      className={cn("overflow-hidden", className)}
      style={{
        animation: `fadeIn 0.5s ease-out ${delay}ms both`,
      }}
    >
      <CardContent className="p-4 sm:p-6">
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-40" />
          </div>

          {/* Progress Bar */}
          <div className="relative">
            <Skeleton className="h-4 sm:h-6 w-full rounded-full" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

