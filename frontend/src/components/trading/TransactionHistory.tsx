"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ExternalLink, TrendingUp, TrendingDown } from "lucide-react";
import { formatEther } from "viem";
import { fetchTrades, type TradeData } from "@/services/chartDataService";

interface TransactionHistoryProps {
  tokenAddress: string;
  limit?: number;
}

const BLOCK_EXPLORER_URL = "https://storyscan.xyz/tx/";

export default function TransactionHistory({ tokenAddress, limit = 50 }: TransactionHistoryProps) {
  const [trades, setTrades] = useState<TradeData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "buy" | "sell">("all");
  const [page, setPage] = useState(1);
  const itemsPerPage = 20;

  useEffect(() => {
    const loadTrades = async () => {
      if (!tokenAddress) return;

      setLoading(true);
      setError(null);

      try {
        const allTrades = await fetchTrades(tokenAddress, "ALL");
        
        // Sort by timestamp descending (newest first)
        allTrades.sort((a, b) => b.timestamp - a.timestamp);
        
        setTrades(allTrades);
      } catch (err) {
        console.error("Error loading transaction history:", err);
        setError(err instanceof Error ? err.message : "Failed to load transactions");
      } finally {
        setLoading(false);
      }
    };

    loadTrades();
  }, [tokenAddress]);

  const filteredTrades = trades.filter((trade) => {
    if (filter === "all") return true;
    return filter === "buy" ? trade.isBuy : !trade.isBuy;
  });

  const paginatedTrades = filteredTrades.slice(
    (page - 1) * itemsPerPage,
    page * itemsPerPage
  );

  const totalPages = Math.ceil(filteredTrades.length / itemsPerPage);

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  const shortenAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  if (loading) {
    return (
      <Card className="bg-card/80 border-border/80">
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Transaction History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-card/80 border-border/80">
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Transaction History</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-red-400">{error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card/80 border-border/80">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">Transaction History</CardTitle>
          <div className="flex gap-2">
            <Button
              variant={filter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setFilter("all");
                setPage(1);
              }}
              className="h-7 text-xs px-2"
            >
              All
            </Button>
            <Button
              variant={filter === "buy" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setFilter("buy");
                setPage(1);
              }}
              className="h-7 text-xs px-2"
            >
              <TrendingUp className="h-3 w-3 mr-1" />
              Buys
            </Button>
            <Button
              variant={filter === "sell" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setFilter("sell");
                setPage(1);
              }}
              className="h-7 text-xs px-2"
            >
              <TrendingDown className="h-3 w-3 mr-1" />
              Sells
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {paginatedTrades.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No transactions found
          </p>
        ) : (
          <div className="space-y-2">
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {paginatedTrades.map((trade, index) => (
                <div
                  key={`${trade.timestamp}-${index}`}
                  className="flex items-center justify-between p-3 bg-muted/40 rounded-lg border border-border/60 text-xs"
                >
                  <div className="flex items-center gap-3">
                    <Badge
                      variant={trade.isBuy ? "default" : "destructive"}
                      className="text-[10px] px-2 py-0"
                    >
                      {trade.isBuy ? (
                        <TrendingUp className="h-2.5 w-2.5 mr-1" />
                      ) : (
                        <TrendingDown className="h-2.5 w-2.5 mr-1" />
                      )}
                      {trade.isBuy ? "Buy" : "Sell"}
                    </Badge>
                    <div className="flex flex-col">
                      <span className="font-medium text-foreground">
                        {Number(formatEther(trade.amountIP)).toFixed(4)} IP
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {Number(formatEther(trade.amountTokens)).toFixed(4)} tokens
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-[10px] text-muted-foreground">
                        {formatTimestamp(trade.timestamp)}
                      </div>
                      <div className="text-[10px] font-mono text-muted-foreground">
                        {shortenAddress(trade.trader || "0x0000")}
                      </div>
                    </div>
                    {trade.txHash && (
                      <a
                        href={`${BLOCK_EXPLORER_URL}${trade.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:text-primary/80"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2 border-t border-border/60">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="h-7 text-xs"
                >
                  Previous
                </Button>
                <span className="text-xs text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="h-7 text-xs"
                >
                  Next
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

