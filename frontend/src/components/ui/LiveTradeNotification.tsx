"use client";

import { useEffect, useRef, useState } from "react";
import { fetchSubgraph } from "@/services/subgraph";
import { formatEther, formatUnits } from "viem";
import { logger } from "@/lib/logger";

type TradeData = {
  id: string;
  type: "BUY" | "SELL";
  tokenSymbol: string;
  amount: string;
  cost: string;
  timestamp: number;
};

export default function LiveTradeNotification() {
  const [tradeQueue, setTradeQueue] = useState<TradeData[]>([]);
  const [currentTrade, setCurrentTrade] = useState<TradeData | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [lastCheckedTimestamp, setLastCheckedTimestamp] = useState<number>(Math.floor(Date.now() / 1000));
  const processingRef = useRef(false);

  // Poll subgraph for new trades
  useEffect(() => {
    console.log("[LiveTradeNotification] Starting polling, lastCheckedTimestamp:", lastCheckedTimestamp);
    
    const fetchNewTrades = async () => {
      try {
        console.log("[LiveTradeNotification] Fetching trades newer than:", lastCheckedTimestamp);
        
        const query = `
          query GetRecentTrades($timestamp: Int!) {
            trades(
              first: 10
              orderBy: timestamp
              orderDirection: desc
              where: { timestamp_gt: $timestamp }
            ) {
              id
              type
              amount
              value
              timestamp
              wrapper { id }
            }
          }
        `;

        const { ok, json } = await fetchSubgraph(query, { timestamp: lastCheckedTimestamp });
        
        console.log("[LiveTradeNotification] Subgraph response:", { ok, data: json?.data });
        
        if (!ok || !json?.data?.trades) {
          console.log("[LiveTradeNotification] No valid response from subgraph");
          return;
        }

        const rawTrades = json.data.trades as any[];
        console.log("[LiveTradeNotification] Raw trades count:", rawTrades.length);
        
        if (rawTrades.length === 0) {
          console.log("[LiveTradeNotification] No new trades found");
          return;
        }

        // Get wrapper addresses to fetch symbols from Supabase
        const wrapperAddrs = Array.from(
          new Set(rawTrades.map((t) => t?.wrapper?.id).filter(Boolean))
        );

        const symbolMap = new Map<string, string>();
        if (wrapperAddrs.length > 0) {
          try {
            const { supabase } = await import("@/lib/supabaseClient");
            if (supabase) {
              const candidates = wrapperAddrs.flatMap((a) => [a, a.toLowerCase()]);
              const { data: rows } = await supabase
                .from("tokens")
                .select("token_address, symbol, name")
                .in("token_address", candidates);
              if (Array.isArray(rows)) {
                for (const row of rows) {
                  const r = row as any;
                  const sym = r.symbol || r.name || "TOKEN";
                  symbolMap.set(String(r.token_address).toLowerCase(), sym);
                }
              }
            }
          } catch (e) {
            console.error("[LiveTradeNotification] Error fetching symbols:", e);
          }
        }

        const newTrades: TradeData[] = rawTrades
          .map((t) => {
            try {
              const amount = t.amount ? formatEther(BigInt(t.amount)) : "0";
              const cost = t.value ? formatEther(BigInt(t.value)) : "0";
              const wrapperId = (t.wrapper?.id || "").toLowerCase();
              const symbol = symbolMap.get(wrapperId) || "TOKEN";
              
              return {
                id: t.id,
                type: t.type === "SELL" ? "SELL" : "BUY",
                tokenSymbol: symbol,
                amount,
                cost,
                timestamp: Number(t.timestamp),
              };
            } catch (err) {
              console.error("[LiveTradeNotification] Error parsing trade:", err);
              return null;
            }
          })
          .filter((t): t is TradeData => t !== null);

        if (newTrades.length > 0) {
          console.log("[LiveTradeNotification] ✅ New trades detected:", newTrades.length, newTrades);
          setTradeQueue((prev) => {
            const updated = [...prev, ...newTrades];
            console.log("[LiveTradeNotification] Queue updated, length:", updated.length);
            return updated;
          });
          const maxTimestamp = Math.max(...newTrades.map((t) => t.timestamp));
          console.log("[LiveTradeNotification] Updating lastCheckedTimestamp to:", maxTimestamp);
          setLastCheckedTimestamp(maxTimestamp);
        }
      } catch (error) {
        console.error("[LiveTradeNotification] Error fetching trades:", error);
        logger.error("[LiveTradeNotification] Error fetching trades:", error);
      }
    };

    fetchNewTrades();
    const interval = setInterval(fetchNewTrades, 5000);
    return () => {
      console.log("[LiveTradeNotification] Cleaning up polling interval");
      clearInterval(interval);
    };
  }, [lastCheckedTimestamp]);

  // Process queue - trigger when animation ends
  useEffect(() => {
    if (isAnimating) {
      console.log("[LiveTradeNotification] Currently animating, waiting...");
      return;
    }

    if (tradeQueue.length === 0) {
      console.log("[LiveTradeNotification] Queue is empty");
      return;
    }

    const nextTrade = tradeQueue[0];
    console.log("[LiveTradeNotification] ▶ Starting animation for trade:", nextTrade);
    
    setCurrentTrade(nextTrade);
    setIsAnimating(true);
    setTradeQueue((prev) => {
      const updated = prev.slice(1);
      console.log("[LiveTradeNotification] Removed from queue, remaining:", updated.length);
      return updated;
    });
  }, [isAnimating, tradeQueue]);

  // Handle animation completion
  useEffect(() => {
    if (!isAnimating || !currentTrade) return;

    console.log("[LiveTradeNotification] Animation timer started (12s)");
    const timer = setTimeout(() => {
      console.log("[LiveTradeNotification] ⏹ Animation complete");
      setIsAnimating(false);
      setCurrentTrade(null);
    }, 12000);

    return () => {
      console.log("[LiveTradeNotification] Cleaning up animation timer");
      clearTimeout(timer);
    };
  }, [isAnimating, currentTrade]);

  if (!currentTrade || !isAnimating) return null;

  const costNum = parseFloat(currentTrade.cost);
  const amountNum = parseFloat(currentTrade.amount);
  const formattedCost = costNum.toFixed(4).replace(/\.?0+$/, "");
  const formattedAmount = amountNum.toLocaleString(undefined, { maximumFractionDigits: 2 });

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 top-20 z-50 overflow-hidden">
        <div className="animate-[ticker-scroll_12s_linear_forwards]">
          <div className="inline-block border border-[#262626] bg-black px-6 py-2.5 shadow-lg">
            <p className="text-xs font-mono tracking-[0.2em] text-foreground">
              <span className={currentTrade.type === "BUY" ? "text-[#CCFF00]" : "text-red-400"}>
                {currentTrade.type}
              </span>
              {" "}
              <span className="text-muted-foreground">
                {formattedAmount} {currentTrade.tokenSymbol}
              </span>
              {" · "}
              <span className="text-primary">
                {formattedCost} IP
              </span>
            </p>
          </div>
        </div>
      </div>
      <style jsx>{`
        @keyframes ticker-scroll {
          0% {
            transform: translateX(100vw);
          }
          100% {
            transform: translateX(-100vw);
          }
        }
      `}</style>
    </>
  );
}
