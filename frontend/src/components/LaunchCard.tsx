"use client"

import { useState, memo } from "react"
import Image from "next/image"
import Link from "next/link"
import { User } from "lucide-react"
import { motion } from "framer-motion"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Tooltip } from "@/components/ui/tooltip"
import { cn, formatMarketCapFull } from "@/lib/utils"

export interface LaunchCardProps {
  image: string
  ticker: string
  marketCap: string
  marketCapRaw?: string | number // Raw value for tooltip
  bondingCurvePercent: number
  createdBy: string
  tokenAddress: string // Token address for navigation
  className?: string
  onClick?: () => void // Optional onClick for backward compatibility
}

function LaunchCardComponent({
  image,
  ticker,
  marketCap,
  marketCapRaw,
  bondingCurvePercent,
  createdBy,
  tokenAddress,
  className,
  onClick,
}: LaunchCardProps) {
  const [imageError, setImageError] = useState(false)
  const [imageLoading, setImageLoading] = useState(true)
  const [placeholderError, setPlaceholderError] = useState(false)

  // Truncate address: show first 6 and last 4 characters for better readability
  const truncateAddress = (address: string) => {
    if (!address || address.length < 10) return address
    // Ensure we have a valid Ethereum address format (0x + 40 chars)
    if (address.startsWith("0x") && address.length === 42) {
      return `${address.slice(0, 8)}...${address.slice(-6)}`
    }
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="h-full"
    >
      <Link
        href={`/pool/${tokenAddress}`}
        className="block no-underline h-full focus:outline-none"
        aria-label={`View ${ticker} token details. Market cap: ${marketCap}. Bonding curve progress: ${bondingCurvePercent.toFixed(1)}%`}
        onClick={onClick}
      >
        <Card
          className={cn(
            "overflow-hidden rounded-xl border shadow-sm transition-all duration-300 ease-in-out",
            "hover:scale-105 hover:shadow-xl hover:shadow-sovry-green/20 hover:border-sovry-green/50",
            "focus-within:ring-2 focus-within:ring-sovry-green focus-within:ring-offset-2 focus-within:ring-offset-zinc-950",
            "grid grid-rows-2 h-full min-h-[300px] sm:min-h-[400px] cursor-pointer",
            className
          )}
        >
      {/* Top 50% - Image Section with 1:1 Aspect Ratio */}
      <div className="relative w-full h-full bg-zinc-800 overflow-hidden flex items-center justify-center">
        <div className="relative w-full aspect-square h-full max-h-full">
          {/* Skeleton/Shimmer Loading State */}
          {imageLoading && !imageError && (
            <div className="absolute inset-0 bg-zinc-800">
              <div className="absolute inset-0 bg-gradient-to-r from-zinc-800 via-zinc-700/50 to-zinc-800 bg-[length:200%_100%] animate-shimmer" />
            </div>
          )}

          {/* Image or Fallback */}
          {!imageError ? (
            <>
              <Image
                src={image}
                alt={`${ticker} token image`}
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
              {/* Gradient Overlay for better text readability */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
            </>
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-zinc-800 via-zinc-900 to-zinc-800">
              {!placeholderError ? (
                <Image
                  src="/placeholder-ip.png"
                  alt={`${ticker} placeholder image`}
                  fill
                  loading="lazy"
                  className="object-cover"
                  onError={() => {
                    setPlaceholderError(true)
                  }}
                  unoptimized
                />
              ) : (
                /* Fallback UI if placeholder image fails */
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-20 h-20 rounded-full bg-zinc-700/50 flex items-center justify-center mb-2 mx-auto">
                      <span className="text-3xl font-bold text-zinc-500">
                        {ticker.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  </div>
                </div>
              )}
              {/* Gradient Overlay for better text readability */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
            </div>
          )}
        </div>
      </div>

      {/* Bottom 50% - Content Section */}
      <CardContent className="p-4 sm:p-6 space-y-3 sm:space-y-4 flex flex-col justify-between h-full">
        <div className="space-y-3">
          {/* Ticker Symbol */}
          <h3 className="text-xl sm:text-2xl font-bold text-zinc-50 tracking-tight">
            {ticker}
          </h3>

          {/* Market Cap Badge */}
          <div>
            {marketCapRaw ? (
              <Tooltip content={`Market Cap: ${formatMarketCapFull(marketCapRaw)}`}>
                <span 
                  className="inline-flex items-center bg-green-500 text-white rounded-full px-2 sm:px-3 py-1 text-xs sm:text-sm font-semibold cursor-help"
                  aria-label={`Market cap: ${formatMarketCapFull(marketCapRaw)}`}
                >
                  Market Cap: {marketCap}
                </span>
              </Tooltip>
            ) : (
              <span 
                className="inline-flex items-center bg-green-500 text-white rounded-full px-2 sm:px-3 py-1 text-xs sm:text-sm font-semibold"
                aria-label={`Market cap: ${marketCap}`}
              >
                Market Cap: {marketCap}
              </span>
            )}
          </div>
        </div>

        <div className="space-y-2">
          {/* Created By */}
          <div className="pt-2 border-t border-zinc-800">
            <Link
              href={`/profile?address=${createdBy}`}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation()
                }
              }}
              className="flex items-center gap-1.5 group focus:outline-none focus:ring-2 focus:ring-sovry-green focus:ring-offset-2 focus:ring-offset-zinc-900 rounded"
              aria-label={`View profile of creator ${truncateAddress(createdBy)}`}
            >
              <User className="h-3 w-3 text-muted-foreground group-hover:text-zinc-300 transition-colors" aria-hidden="true" />
              <span className="text-xs text-muted-foreground group-hover:text-zinc-300 transition-colors">
                Created by{" "}
                <span className="font-medium group-hover:text-zinc-200 transition-colors">
                  {truncateAddress(createdBy)}
                </span>
              </span>
            </Link>
          </div>

          {/* Bonding Curve Progress - At the bottom */}
          <div className="space-y-2" role="progressbar" aria-label={`Bonding curve progress: ${bondingCurvePercent.toFixed(1)}%`} aria-valuenow={bondingCurvePercent} aria-valuemin={0} aria-valuemax={100}>
            <div className="flex justify-between items-center">
              <span className="text-xs sm:text-sm text-zinc-400 font-medium">
                Bonding Curve: {bondingCurvePercent.toFixed(1)}%
              </span>
              <span className="text-xs sm:text-sm text-zinc-300 font-semibold">
                {bondingCurvePercent.toFixed(1)}%
              </span>
            </div>
            <Progress value={bondingCurvePercent} className="h-2" />
          </div>
        </div>
      </CardContent>
    </Card>
    </Link>
    </motion.div>
  )
}

// Memoize component to prevent unnecessary re-renders
export const LaunchCard = memo(LaunchCardComponent)
LaunchCard.displayName = "LaunchCard"

