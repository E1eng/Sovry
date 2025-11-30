"use client"

import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

export interface ChartSkeletonProps {
  height?: number
  className?: string
  delay?: number
}

export function ChartSkeleton({ height = 400, className, delay = 100 }: ChartSkeletonProps) {
  return (
    <Card 
      className={cn("overflow-hidden", className)}
      style={{
        animation: `fadeIn 0.5s ease-out ${delay}ms both`,
      }}
    >
      <CardHeader>
        <Skeleton className="h-6 w-32" />
      </CardHeader>
      <CardContent>
        <div className="relative" style={{ height: `${height}px` }}>
          {/* Chart Area with Axis Lines */}
          <div className="absolute inset-0 flex flex-col">
            {/* Y-axis labels */}
            <div className="absolute left-0 top-0 bottom-0 w-12 flex flex-col justify-between py-2">
              <Skeleton className="h-3 w-10" />
              <Skeleton className="h-3 w-10" />
              <Skeleton className="h-3 w-10" />
              <Skeleton className="h-3 w-10" />
            </div>

            {/* Chart Grid Lines */}
            <div className="flex-1 ml-12 mr-2 flex flex-col justify-between py-2">
              {/* Horizontal grid lines */}
              {[...Array(4)].map((_, i) => (
                <div key={i} className="relative">
                  <div className="absolute inset-0 border-t border-zinc-800/50" />
                </div>
              ))}
            </div>

            {/* X-axis labels */}
            <div className="absolute bottom-0 left-12 right-2 h-8 flex justify-between items-center px-2">
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-3 w-12" />
            </div>

            {/* Chart Candlesticks Skeleton */}
            <div className="absolute inset-0 ml-12 mr-2 mb-8 flex items-end justify-between px-2">
              {[...Array(20)].map((_, i) => (
                <Skeleton
                  key={i}
                  className="w-3 rounded-sm"
                  style={{
                    height: `${Math.random() * 60 + 20}%`,
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

