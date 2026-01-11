"use client"

import { Skeleton } from "@/components/ui/skeleton"
import { TokenHeaderSkeleton } from "@/components/token/TokenHeaderSkeleton"
import { ChartSkeleton } from "@/components/token/ChartSkeleton"
import { SwapInterfaceSkeleton } from "@/components/swap/SwapInterfaceSkeleton"
import { ProgressBarSkeleton } from "@/components/token/ProgressBarSkeleton"
import { Card, CardContent, CardHeader } from "@/components/ui/card"

export function TokenDetailSkeleton() {
  return (
    <>
      <div className="min-h-screen px-3 sm:px-4 md:px-6 lg:px-8 py-5 sm:py-8 lg:py-10">
        <div className="w-full space-y-5 sm:space-y-6">
          {/* Breadcrumb Skeleton */}
          <div
            style={{
              animation: "fadeIn 0.5s ease-out 0ms both",
            }}
          >
            <Skeleton className="h-5 w-48" />
          </div>

          {/* Token Header - Mobile */}
          <div
            className="lg:hidden"
            style={{
              animation: "fadeIn 0.5s ease-out 0ms both",
            }}
          >
            <TokenHeaderSkeleton delay={0} />
          </div>

          {/* Mobile Layout: Stack vertically with custom order */}
          <div className="flex flex-col lg:hidden space-y-4 sm:space-y-6">
            {/* Swap Interface - First on mobile */}
            <SwapInterfaceSkeleton delay={100} />

            {/* Progress to Graduation - Second on mobile */}
            <ProgressBarSkeleton delay={200} />

            {/* Trading Chart - Third on mobile */}
            <ChartSkeleton height={300} delay={300} />

            {/* Activity Feed - Fourth on mobile */}
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

            {/* Comments - Fifth on mobile */}
            <Card
              style={{
                animation: "fadeIn 0.5s ease-out 450ms both",
              }}
            >
              <CardHeader>
                <Skeleton className="h-6 w-32" />
              </CardHeader>
              <CardContent className="space-y-2">
                {[...Array(2)].map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </CardContent>
            </Card>

            {/* Top Holders - Sixth on mobile */}
            <Card
              style={{
                animation: "fadeIn 0.5s ease-out 500ms both",
              }}
            >
              <CardHeader>
                <Skeleton className="h-6 w-32" />
              </CardHeader>
              <CardContent className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Desktop Layout: Two-Column Grid (match live layout 62% / 38%) */}
          <div className="hidden lg:grid grid-cols-[62%_38%] gap-6 items-start">
            {/* Left Column: Header already above, then Chart, Activity, Comments */}
            <div className="space-y-6">
              {/* Desktop Token Header */}
              <div
                className="hidden lg:block"
                style={{
                  animation: "fadeIn 0.5s ease-out 0ms both",
                }}
              >
                <TokenHeaderSkeleton delay={0} />
              </div>

              {/* Chart Skeleton */}
              <ChartSkeleton height={500} delay={100} />

              {/* Activity Feed Skeleton */}
              <Card
                style={{
                  animation: "fadeIn 0.5s ease-out 200ms both",
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

              {/* Comments Skeleton */}
              <Card
                style={{
                  animation: "fadeIn 0.5s ease-out 260ms both",
                }}
              >
                <CardHeader>
                  <Skeleton className="h-6 w-32" />
                </CardHeader>
                <CardContent className="space-y-2">
                  {[...Array(2)].map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </CardContent>
              </Card>
            </div>

            {/* Right Column: Swap, Progress, Top Holders */}
            <div className="space-y-4 lg:space-y-5 lg:sticky lg:top-20 self-start">
              {/* Swap Interface Skeleton */}
              <SwapInterfaceSkeleton delay={150} />

              {/* Progress Bar Skeleton */}
              <ProgressBarSkeleton delay={220} />

              {/* Top Holders Skeleton */}
              <Card
                style={{
                  animation: "fadeIn 0.5s ease-out 260ms both",
                }}
              >
                <CardHeader>
                  <Skeleton className="h-6 w-32" />
                </CardHeader>
                <CardContent className="space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-8 w-full" />
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

