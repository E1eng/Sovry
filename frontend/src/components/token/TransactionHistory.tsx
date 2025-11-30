"use client"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ExternalLink, TrendingUp, TrendingDown, Loader2 } from "lucide-react"
import { useRawTradeHistory } from "@/hooks/useRawTradeHistory"
import { getAddressInitials, getAddressGradient } from "@/lib/avatarUtils"
import { cn } from "@/lib/utils"
import Link from "next/link"

export interface TransactionHistoryProps {
  tokenAddress: string
  limit?: number
  className?: string
}

const BLOCK_EXPLORER_URL = "https://storyscan.xyz/tx/"

/**
 * Format timestamp to relative time
 */
function formatRelativeTime(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000)
  const diff = now - timestamp

  if (diff < 60) return "Just now"
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  
  const date = new Date(timestamp * 1000)
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  })
}

/**
 * Truncate address
 */
function truncateAddress(address: string): string {
  if (!address || address.length < 10) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export function TransactionHistory({
  tokenAddress,
  limit = 20,
  className,
}: TransactionHistoryProps) {
  const { trades, isLoading, error, refetch } = useRawTradeHistory(tokenAddress, limit * 2) // Fetch more for pagination
  const [displayLimit, setDisplayLimit] = useState(limit)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const observerRef = useRef<IntersectionObserver | null>(null)
  const loadMoreRef = useRef<HTMLDivElement | null>(null)

  // Auto-refresh when new trades occur
  useEffect(() => {
    const interval = setInterval(() => {
      refetch()
    }, 30000) // Refresh every 30 seconds

    return () => clearInterval(interval)
  }, [refetch])

  // Infinite scroll setup
  useEffect(() => {
    if (!loadMoreRef.current || isLoading || displayLimit >= trades.length) return

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isLoadingMore) {
          setIsLoadingMore(true)
          setTimeout(() => {
            setDisplayLimit((prev) => Math.min(prev + limit, trades.length))
            setIsLoadingMore(false)
          }, 300)
        }
      },
      { threshold: 0.1 }
    )

    observerRef.current.observe(loadMoreRef.current)

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect()
      }
    }
  }, [trades.length, displayLimit, isLoading, isLoadingMore, limit])

  const displayedTrades = trades.slice(0, displayLimit)
  const hasMore = displayLimit < trades.length

  if (isLoading && trades.length === 0) {
    return (
      <Card className={cn("overflow-hidden", className)}>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-6 w-16" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className={cn("overflow-hidden", className)}>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <p className="text-sm text-red-400 mb-4">
              {error instanceof Error ? error.message : "Failed to load transactions"}
            </p>
            <Button onClick={() => refetch()} variant="outline" size="sm">
              <Loader2 className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (trades.length === 0) {
    return (
      <Card className={cn("overflow-hidden", className)}>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <p className="text-sm text-zinc-400">No transactions yet</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-[600px] overflow-y-auto">
          <div className="divide-y divide-zinc-800">
            {displayedTrades.map((trade, index) => (
              <div
                key={`${trade.txHash}-${trade.timestamp}-${index}`}
                className="p-4 hover:bg-zinc-900/50 transition-colors"
              >
                <div className="flex items-start gap-3">
                  {/* User Avatar */}
                  <div
                    className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-xs font-semibold text-white border-2 border-zinc-800"
                    style={{
                      background: getAddressGradient(trade.trader),
                    }}
                    title={trade.trader}
                  >
                    {getAddressInitials(trade.trader)}
                  </div>

                  {/* Trade Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {/* Trade Type Badge */}
                      <Badge
                        variant={trade.isBuy ? "default" : "destructive"}
                        className={cn(
                          "text-xs px-2 py-0.5 font-semibold",
                          trade.isBuy
                            ? "bg-green-500/20 text-green-400 border-green-500/50"
                            : "bg-red-500/20 text-red-400 border-red-500/50"
                        )}
                      >
                        {trade.isBuy ? (
                          <TrendingUp className="h-3 w-3 mr-1 inline" />
                        ) : (
                          <TrendingDown className="h-3 w-3 mr-1 inline" />
                        )}
                        {trade.isBuy ? "BUY" : "SELL"}
                      </Badge>

                      {/* Truncated Address */}
                      <Link
                        href={`/profile/${trade.trader}`}
                        className="text-xs text-zinc-400 hover:text-zinc-300 font-mono transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {truncateAddress(trade.trader)}
                      </Link>
                    </div>

                    {/* Amount */}
                    <p className="text-sm text-zinc-50 mb-1">
                      {trade.formattedTokens} tokens for {trade.formattedIP} IP
                    </p>

                    {/* Timestamp and Explorer Link */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-500">
                        {formatRelativeTime(trade.timestamp)}
                      </span>
                      {trade.txHash && (
                        <a
                          href={`${BLOCK_EXPLORER_URL}${trade.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-zinc-400 hover:text-zinc-300 transition-colors inline-flex items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink className="h-3 w-3" />
                          View on Explorer
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Infinite Scroll Trigger */}
          {hasMore && (
            <div ref={loadMoreRef} className="p-4 text-center">
              {isLoadingMore ? (
                <Loader2 className="h-4 w-4 animate-spin text-zinc-400 mx-auto" />
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDisplayLimit((prev) => Math.min(prev + limit, trades.length))}
                  className="text-xs text-zinc-400 hover:text-zinc-300"
                >
                  Load More
                </Button>
              )}
            </div>
          )}

          {/* Show total count */}
          {trades.length > displayLimit && (
            <div className="p-4 text-center border-t border-zinc-800">
              <p className="text-xs text-zinc-500">
                Showing {displayLimit} of {trades.length} transactions
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

