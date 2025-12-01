"use client"

import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

export interface SwapInterfaceSkeletonProps {
  className?: string
  delay?: number
}

export function SwapInterfaceSkeleton({ className, delay = 200 }: SwapInterfaceSkeletonProps) {
  return (
    <Card 
      className={cn("overflow-hidden", className)}
      style={{
        animation: `fadeIn 0.5s ease-out ${delay}ms both`,
      }}
    >
      <CardHeader className="relative pb-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-8 w-8 rounded" />
        </div>
        <div className="flex items-center justify-end mt-2">
          <Skeleton className="h-3 w-20" />
        </div>
        {/* Tabs Skeleton */}
        <div className="mt-4 flex gap-2">
          <Skeleton className="h-9 flex-1 rounded-md" />
          <Skeleton className="h-9 flex-1 rounded-md" />
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* You Pay Section */}
        <div className="space-y-2">
          <Skeleton className="h-3 w-16" />
          <div className="flex flex-col sm:flex-row gap-2">
            <Skeleton className="flex-1 h-14 sm:h-16 rounded-md" />
            <Skeleton className="w-full sm:w-24 h-14 sm:h-16 rounded-md" />
          </div>
          <div className="flex items-center justify-between">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-6 w-12 rounded" />
          </div>
        </div>

        {/* Swap Arrow Button */}
        <div className="flex justify-center -my-2">
          <Skeleton className="h-10 w-10 rounded-full" />
        </div>

        {/* You Receive Section */}
        <div className="space-y-2">
          <Skeleton className="h-3 w-20" />
          <div className="flex flex-col sm:flex-row gap-2">
            <Skeleton className="flex-1 h-14 sm:h-16 rounded-md" />
            <Skeleton className="w-full sm:w-24 h-14 sm:h-16 rounded-md" />
          </div>
          <Skeleton className="h-3 w-32" />
        </div>

        {/* Place Trade Button */}
        <Skeleton className="h-12 w-full rounded-md mt-4" />
      </CardContent>
    </Card>
  )
}


