"use client"

import { useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ExternalLink, TrendingUp, TrendingDown, Loader2 } from "lucide-react"
import { useRawTradeHistory } from "@/hooks/useRawTradeHistory"
import { getAddressInitials, getAddressGradient } from "@/lib/avatarUtils"
import { cn, truncateAddress } from "@/lib/utils"
import { STORYSCAN_BASE_URL } from "@/lib/env"

export interface TransactionHistoryProps {
  tokenAddress: string
  tokenSymbol?: string
  limit?: number
  className?: string
}

const BLOCK_EXPLORER_URL = `${STORYSCAN_BASE_URL.replace(/\/$/, "")}/tx/`
const ADDRESS_EXPLORER_URL = `${STORYSCAN_BASE_URL.replace(/\/$/, "")}/address/`

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
        <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-2.5">
          <span className="text-xs font-semibold text-foreground">Recent Activity</span>
        </div>
        <CardContent className="p-4">
          <div className="space-y-2.5">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <Skeleton className="h-7 w-7 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-2.5 w-20" />
                </div>
                <Skeleton className="h-4 w-12" />
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
        <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-2.5">
          <span className="text-xs font-semibold text-foreground">Recent Activity</span>
        </div>
        <CardContent className="p-4">
          <div className="text-center py-4">
            <p className="text-[10px] font-mono text-destructive mb-3">
              {error instanceof Error ? error.message : "Failed to load transactions"}
            </p>
            <Button onClick={() => refetch()} variant="outline" size="sm" className="h-7 text-[10px] font-mono uppercase tracking-[0.2em]">
              <Loader2 className="h-3 w-3 mr-1.5" />
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
        <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-2.5">
          <span className="text-xs font-semibold text-foreground">Recent Activity</span>
        </div>
        <CardContent className="p-4">
          <p className="text-[10px] font-mono text-muted-foreground text-center py-4">No transactions yet</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={cn("overflow-hidden", className)}>
      <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-2.5">
        <span className="text-xs font-semibold text-foreground">Recent Activity</span>
        <Badge variant="outline" className="text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground border-border px-1.5 py-0">
          Live
        </Badge>
      </div>
      <CardContent className="p-0 overflow-hidden">
        <div className="max-h-[480px] overflow-y-auto no-scrollbar">
          <div className="divide-y divide-border">
            {displayedTrades.map((trade, index) => (
              <div
                key={`${trade.txHash}-${trade.timestamp}-${index}`}
                className="px-4 py-2.5 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-semibold text-white border border-border"
                    style={{ background: getAddressGradient(trade.trader) }}
                    title={trade.trader}
                  >
                    {getAddressInitials(trade.trader)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-mono text-foreground truncate">
                        {trade.formattedTokens} {symbolLabel}
                        <span className="text-[10px] text-muted-foreground"> · {trade.formattedIP} IP</span>
                      </p>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[9px] px-1.5 py-0 font-mono uppercase tracking-[0.2em] flex-shrink-0",
                          trade.isBuy
                            ? "bg-primary/10 text-primary border-primary/40"
                            : "bg-secondary/10 text-secondary border-secondary/40"
                        )}
                      >
                        {trade.isBuy ? (
                          <TrendingUp className="h-2.5 w-2.5 mr-0.5 inline" />
                        ) : (
                          <TrendingDown className="h-2.5 w-2.5 mr-0.5 inline" />
                        )}
                        {trade.isBuy ? "BUY" : "SELL"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <a
                        href={`${ADDRESS_EXPLORER_URL}${trade.trader}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-muted-foreground hover:text-foreground font-mono transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {truncateAddress(trade.trader)}
                      </a>
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {formatRelativeTime(trade.timestamp)}
                      </span>
                      {trade.txHash && (
                        <a
                          href={`${BLOCK_EXPLORER_URL}${trade.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-0.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      )}
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


