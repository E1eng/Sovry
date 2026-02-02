"use client"

import { useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ExternalLink, TrendingUp, TrendingDown, Loader2 } from "lucide-react"
import { useRawTradeHistory } from "@/hooks/useRawTradeHistory"
import { getAddressInitials, getAddressGradient } from "@/lib/avatarUtils"
import { cn, truncateAddress } from "@/lib/utils"

export interface TransactionHistoryProps {
  tokenAddress: string
  tokenSymbol?: string
  limit?: number
  className?: string
}

const BLOCK_EXPLORER_URL = "https://aeneid.storyscan.io/tx/"
const ADDRESS_EXPLORER_URL = "https://aeneid.storyscan.io/address/"

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

export function TransactionHistory({
  tokenAddress,
  tokenSymbol,
  limit = 20,
  className,
}: TransactionHistoryProps) {
  const { trades, isLoading, error, refetch } = useRawTradeHistory(tokenAddress, limit)

  // Auto-refresh when new trades occur
  useEffect(() => {
    const interval = setInterval(() => {
      refetch()
    }, 30000) // Refresh every 30 seconds

    return () => clearInterval(interval)
  }, [refetch])

  // Listen for explicit refresh events from trading UI (e.g., after a
  // successful buy/sell) so Recent Activity updates quickly.
  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<{ tokenAddress?: string }>
      if (!custom.detail || custom.detail.tokenAddress === tokenAddress) {
        refetch()
      }
    }

    if (typeof window !== "undefined") {
      window.addEventListener("refresh-trades", handler)
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("refresh-trades", handler)
      }
    }
  }, [refetch, tokenAddress])

  const displayedTrades = trades.slice(0, limit)
  const symbolLabel = tokenSymbol || "tokens"

  if (isLoading && trades.length === 0) {
    return (
      <Card className={cn("overflow-hidden", className)}>
        <CardHeader className="border-b border-border bg-muted/60">
          <div className="space-y-1">
            <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Activity</div>
            <CardTitle className="text-lg font-semibold">Recent Activity</CardTitle>
          </div>
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
        <CardHeader className="border-b border-border bg-muted/60">
          <div className="space-y-1">
            <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Activity</div>
            <CardTitle className="text-lg font-semibold">Recent Activity</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <p className="text-sm text-destructive mb-4">
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
        <CardHeader className="border-b border-border bg-muted/60">
          <div className="space-y-1">
            <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Activity</div>
            <CardTitle className="text-lg font-semibold">Recent Activity</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">No transactions yet</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="border-b border-border bg-muted/60">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Activity</div>
            <CardTitle className="text-lg font-semibold">Recent Activity</CardTitle>
          </div>
          <Badge variant="outline" className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground border-border">
            Live
          </Badge>
        </div>
      </CardHeader>
      <CardContent className={cn("overflow-hidden", className)}>
        <div className="max-h-[600px] overflow-y-auto no-scrollbar">
          <div className="divide-y divide-border">
            {displayedTrades.map((trade, index) => (
              <div
                key={`${trade.txHash}-${trade.timestamp}-${index}`}
                className="p-4 sm:p-5 hover:bg-muted/40 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {/* User Avatar */}
                  <div
                    className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-[11px] font-semibold text-white border border-border"
                    style={{
                      background: getAddressGradient(trade.trader),
                    }}
                    title={trade.trader}
                  >
                    {getAddressInitials(trade.trader)}
                  </div>

                  {/* Trade Info */}
                  <div className="flex-1 min-w-0">
                    {/* Top row: amount + type badge */}
                    <div className="flex items-center justify-between gap-2 mb-1">
                      {/* Amount */}
                      <p className="text-sm text-foreground font-medium truncate">
                        {trade.formattedTokens} {symbolLabel}
                        <span className="text-xs text-muted-foreground"> · {trade.formattedIP} IP</span>
                      </p>

                      {/* Trade Type Badge */}
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] px-2 py-0.5 font-mono uppercase tracking-[0.2em]",
                          trade.isBuy
                            ? "bg-primary/10 text-primary border-primary/40"
                            : "bg-secondary/10 text-secondary border-secondary/40"
                        )}
                      >
                        {trade.isBuy ? (
                          <TrendingUp className="h-3 w-3 mr-1 inline" />
                        ) : (
                          <TrendingDown className="h-3 w-3 mr-1 inline" />
                        )}
                        {trade.isBuy ? "BUY" : "SELL"}
                      </Badge>
                    </div>

                    {/* Bottom row: trader (top) + timestamp / explorer (below), all left-aligned */}
                    <div className="space-y-0.5">
                      {/* Trader Address */}
                      <a
                        href={`${ADDRESS_EXPLORER_URL}${trade.trader}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-muted-foreground hover:text-foreground font-mono transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {truncateAddress(trade.trader)}
                      </a>

                      {/* Timestamp and Explorer Link */}
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                          {formatRelativeTime(trade.timestamp)}
                        </span>
                        {trade.txHash && (
                          <a
                            href={`${BLOCK_EXPLORER_URL}${trade.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
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
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}


