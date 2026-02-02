"use client"

import { useState, memo } from "react"
import Image from "next/image"
import Link from "next/link"
import { motion } from "framer-motion"
import { cn, truncateAddress } from "@/lib/utils"

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
  const symbolFallback = truncateAddress(tokenAddress, {
    start: 4,
    end: 0,
    stripPrefix: true,
    minLength: 4,
    fallback: ticker.slice(0, 6).toUpperCase(),
  }).toUpperCase()
  const displaySymbol = symbol || symbolFallback

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
            "rounded-sm border border-border bg-card transition-colors",
            "hover:border-primary/50",
            "px-4 py-3 sm:px-5 sm:py-4",
            className
          )}
        >
          {/* Left - Square thumbnail */}
          <div className="relative h-16 w-16 sm:h-20 sm:w-20 border border-border overflow-hidden bg-muted flex-shrink-0">
            {hasImage && imageLoading && !imageError && (
              <div className="absolute inset-0 bg-muted animate-pulse" />
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
              <div className="flex h-full w-full items-center justify-center">
                <span className="text-base font-semibold text-muted-foreground">
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
                <h3 className="truncate text-sm sm:text-base font-semibold text-foreground leading-snug">
                  {ticker}
                </h3>
                <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-mono">
                  {displaySymbol}
                </p>
              </div>
              <span className="inline-flex items-center border border-border px-2 py-1 text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground whitespace-nowrap tabular-nums">
                MC {marketCap}
              </span>
            </div>

            {/* Bonding progress */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                <span>Bonding</span>
                <span className="font-mono text-foreground tabular-nums">
                  {Math.max(0, Math.min(100, bondingCurvePercent)).toFixed(1)}%
                </span>
              </div>
              <div className="h-1 w-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
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

