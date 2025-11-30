"use client"

import { Skeleton } from "@/components/ui/skeleton"
import { TokenHeaderSkeleton } from "./TokenHeaderSkeleton"
import { ChartSkeleton } from "./ChartSkeleton"
import { SwapInterfaceSkeleton } from "./SwapInterfaceSkeleton"
import { ProgressBarSkeleton } from "./ProgressBarSkeleton"
import { Card, CardContent, CardHeader } from "@/components/ui/card"

export function TokenDetailSkeleton() {
  return (
    <>
      <div className="min-h-screen px-4 md:px-6 py-8 sm:py-12">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Breadcrumb Skeleton */}
          <div
            style={{
              animation: "fadeIn 0.5s ease-out 0ms both",
            }}
          >
            <Skeleton className="h-5 w-48" />
          </div>

          {/* Token Header Skeleton */}
          <TokenHeaderSkeleton delay={0} />

          {/* Mobile Layout: Stack vertically with custom order */}
          <div className="flex flex-col lg:hidden space-y-6">
            {/* Swap Interface - First on mobile */}
            <SwapInterfaceSkeleton delay={100} />

            {/* Progress to Graduation - Second on mobile */}
            <ProgressBarSkeleton delay={200} />

            {/* Trading Chart - Third on mobile */}
            <ChartSkeleton height={300} delay={300} />

            {/* Activity Feed - Last on mobile */}
            <Card
              style={{
                animation: "fadeIn 0.5s ease-out 400ms both",
              }}
            >
              <CardHeader>
                <Skeleton className="h-6 w-32" />
              </CardHeader>
              <CardContent className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Desktop Layout: Two-Column Grid */}
          <div className="hidden lg:grid grid-cols-[60%_40%] gap-6">
            {/* Left Column */}
            <div className="space-y-6">
              {/* Chart Skeleton */}
              <ChartSkeleton height={500} delay={100} />

              {/* Progress Bar Skeleton */}
              <ProgressBarSkeleton delay={200} />
            </div>

            {/* Right Column */}
            <div className="space-y-6">
              {/* Swap Interface Skeleton */}
              <SwapInterfaceSkeleton delay={150} />

              {/* Activity Feed Skeleton */}
              <Card
                style={{
                  animation: "fadeIn 0.5s ease-out 250ms both",
                }}
              >
                <CardHeader>
                  <Skeleton className="h-6 w-32" />
                </CardHeader>
                <CardContent className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}


