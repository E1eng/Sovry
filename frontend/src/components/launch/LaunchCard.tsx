"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

export interface LaunchCardProps {
  tickerSymbol: string
  marketCap?: string
  bondingCurveProgress?: number
  imageUrl?: string
  imageAlt?: string
  className?: string
  onClick?: () => void
}

export function LaunchCard({
  tickerSymbol,
  marketCap,
  bondingCurveProgress = 0,
  imageUrl,
  imageAlt,
  className,
  onClick,
}: LaunchCardProps) {
  return (
    <Card
      className={cn(
        "overflow-hidden transition-all hover:border-sovry-green/50 hover:shadow-lg hover:shadow-sovry-green/10 flex flex-col aspect-[2/3]",
        onClick && "cursor-pointer",
        className
      )}
      onClick={onClick}
    >
      {/* Top Half - Image */}
      <div className="relative w-full flex-1 bg-zinc-800 overflow-hidden">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={imageAlt || tickerSymbol}
            className="w-full h-full object-cover"
            onError={(e) => {
              // Fallback to gradient background if image fails to load
              const target = e.target as HTMLImageElement
              target.style.display = "none"
              if (target.parentElement) {
                target.parentElement.className += " bg-gradient-to-br from-zinc-800 to-zinc-900"
              }
            }}
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-zinc-800 to-zinc-900 flex items-center justify-center">
            <span className="text-4xl font-bold text-zinc-600">
              {tickerSymbol.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
      </div>

      {/* Bottom Half - Content */}
      <CardContent className="p-6 space-y-4">
        {/* Ticker Symbol */}
        <h3 className="text-3xl font-bold text-zinc-50 tracking-tight">
          {tickerSymbol}
        </h3>

        {/* Market Cap Badge */}
        {marketCap && (
          <div>
            <Badge variant="default" className="text-sm font-semibold">
              Market Cap: {marketCap}
            </Badge>
          </div>
        )}

        {/* Bonding Curve Progress */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="text-zinc-400 font-medium">Bonding Curve</span>
            <span className="text-zinc-300 font-semibold">
              {bondingCurveProgress.toFixed(1)}%
            </span>
          </div>
          <Progress value={bondingCurveProgress} className="h-2" />
        </div>
      </CardContent>
    </Card>
  )
}

