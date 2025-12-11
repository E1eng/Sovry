"use client"

import { useState, memo } from "react"
import Image from "next/image"
import Link from "next/link"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

export interface LaunchCardProps {
  image: string
  ticker: string
  symbol?: string
  marketCap: string
  marketCapRaw?: string | number
  bondingCurvePercent: number
  createdBy: string
  tokenAddress: string
  className?: string
  onClick?: () => void
}

function LaunchCardComponent({
  image,
  ticker,
  symbol,
  marketCap,
  bondingCurvePercent,
  tokenAddress,
  className,
  onClick,
}: LaunchCardProps) {
  const [imageError, setImageError] = useState(false)
  const [imageLoading, setImageLoading] = useState(true)

  const hasImage = typeof image === "string" && image.trim().length > 0
  const displaySymbol = symbol || ticker.slice(0, 6).toUpperCase()

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="h-full"
    >
      <Link
        href={`/pool/${tokenAddress}`}
        className="block no-underline h-full focus:outline-none group"
        onClick={onClick}
      >
        {/* Card Container */}
        <div
          className={cn(
            "relative flex h-full cursor-pointer items-start gap-4 overflow-hidden",
            "rounded-xl border border-zinc-800 bg-zinc-900/50 backdrop-blur-sm",
            "shadow-sm transition-all duration-200",
            "hover:border-sovry-green/70 hover:shadow-[0_0_30px_rgba(34,197,94,0.25)] hover:bg-zinc-900/80",
            "px-4 py-3 sm:px-5 sm:py-4",
            className
          )}
        >
          {/* Left - Square thumbnail */}
          <div className="relative h-16 w-16 sm:h-20 sm:w-20 rounded-lg overflow-hidden bg-zinc-900/80 flex-shrink-0">
            {hasImage && imageLoading && !imageError && (
              <div className="absolute inset-0 bg-zinc-800">
                <div className="absolute inset-0 bg-gradient-to-r from-zinc-800 via-zinc-700/50 to-zinc-800 bg-[length:200%_100%] animate-shimmer" />
              </div>
            )}
            {hasImage && !imageError ? (
              <Image
                src={image}
                alt={ticker}
                fill
                loading="lazy"
                className={cn(
                  "object-cover transition-opacity duration-300",
                  imageLoading ? "opacity-0" : "opacity-100"
                )}
                onLoad={() => setImageLoading(false)}
                onError={() => {
                  setImageError(true)
                  setImageLoading(false)
                }}
                unoptimized
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-sovry-green/20 to-sovry-pink/20">
                <span className="text-base font-bold text-zinc-400">
                  {ticker.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
          </div>

          {/* Right - Content */}
          <div className="flex-1 min-w-0 flex flex-col justify-between gap-2">
            {/* Token name + symbol + market cap pill */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-0.5">
                <h3 className="truncate text-sm sm:text-base font-semibold text-zinc-50 leading-snug">
                  {ticker}
                </h3>
                <p className="text-[11px] sm:text-xs text-zinc-500">
                  ({displaySymbol})
                </p>
              </div>
              <span className="inline-flex items-center rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] sm:text-xs font-medium text-emerald-300 whitespace-nowrap">
                MC {marketCap}
              </span>
            </div>

            {/* Bonding progress */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] sm:text-xs text-zinc-400">
                <span>Bonding</span>
                <span className="font-semibold text-zinc-100">
                  {Math.max(0, Math.min(100, bondingCurvePercent)).toFixed(1)}%
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-zinc-800/80 overflow-hidden">
                <div
                  className="h-full rounded-full bg-sovry-green transition-all duration-300"
                  style={{ width: `${Math.max(0, Math.min(100, bondingCurvePercent))}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  )
}

export const LaunchCard = memo(LaunchCardComponent)
LaunchCard.displayName = "LaunchCard"

