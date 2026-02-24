"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fetchSubgraph } from "@/services/subgraph";
import { formatEther } from "viem";
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
  // We keep a monotonic cursor (seconds) plus a seen-id set to avoid missing trades
  // that share the same second timestamp.
  const [cursorTs, setCursorTs] = useState<number>(Math.floor(Date.now() / 1000));
  const seenTradeIdsRef = useRef<Set<string>>(new Set());

  // Ticker animation duration in ms (and CSS seconds). Keep in sync.
  const ANIM_MS = 12_000;
  const ANIM_S = useMemo(() => `${ANIM_MS / 1000}s`, []);

  // Poll subgraph for new trades
  useEffect(() => {
    // NOTE: This is client-side polling. The subgraph can lag a few seconds.
    const fetchNewTrades = async () => {
      try {
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

        const { ok, json } = await fetchSubgraph(query, { timestamp: cursorTs });
        if (!ok || !json?.data?.trades) {
          return;
        }

        const rawTrades = json.data.trades as any[];
        if (rawTrades.length === 0) {
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
              return null;
            }
          })
          .filter((t): t is TradeData => t !== null);

        if (newTrades.length > 0) {
          // Dedupe by trade.id (subgraph entity id)
          const unseen = newTrades.filter((t) => !seenTradeIdsRef.current.has(t.id));
          if (unseen.length === 0) return;
          for (const t of unseen) seenTradeIdsRef.current.add(t.id);

          setTradeQueue((prev) => [...prev, ...unseen]);

          // Move cursor forward, but keep it monotonic.
          // Subgraph timestamps are in seconds, so multiple trades may share a timestamp.
          const maxTimestamp = Math.max(...unseen.map((t) => t.timestamp));
          setCursorTs((prev) => (maxTimestamp > prev ? maxTimestamp : prev));
        }
      } catch (error) {
        logger.error("[LiveTradeNotification] Error fetching trades:", error);
      }
    };

    fetchNewTrades();
    const interval = setInterval(fetchNewTrades, 5000);
    return () => {
      clearInterval(interval);
    };
  }, [cursorTs]);

  // Process queue - trigger when animation ends
  useEffect(() => {
    if (isAnimating) {
      return;
    }

    if (tradeQueue.length === 0) {
      return;
    }

    const nextTrade = tradeQueue[0];
    setCurrentTrade(nextTrade);
    setIsAnimating(true);
    setTradeQueue((prev) => {
      return prev.slice(1);
    });
  }, [isAnimating, tradeQueue]);

  // Handle animation completion
  useEffect(() => {
    if (!isAnimating || !currentTrade) return;

    const timer = setTimeout(() => {
      setIsAnimating(false);
      setCurrentTrade(null);
    }, ANIM_MS);

    return () => {
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
        <div className={`animate-[ticker-scroll_${ANIM_S}_linear_forwards]`}>
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
