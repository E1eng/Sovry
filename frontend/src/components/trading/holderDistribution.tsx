"use client";

import { useState, useEffect } from "react";
// Card wrapper provided by parent (pool page)
import { Loader2 } from "lucide-react";
import { getHolderDistribution, type HolderDistribution } from "@/services/holderService";
import { SOVRY_EXCHANGE_ADDRESS } from "@/services/storyProtocolService";
import { logger } from "@/lib/logger";
import { STORYSCAN_BASE_URL } from "@/lib/env";

const ADDRESS_EXPLORER_URL = `${STORYSCAN_BASE_URL.replace(/\/$/, "")}/address/`;

interface HolderDistributionProps {
  tokenAddress: string;
  tokenSymbol?: string;
  creatorAddress?: string;
}

export default function HolderDistribution({ tokenAddress, tokenSymbol, creatorAddress }: HolderDistributionProps) {
  const [distribution, setDistribution] = useState<HolderDistribution | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadDistribution = async () => {
      if (!tokenAddress) return;

      setLoading(true);
      setError(null);

      try {
        const data = await getHolderDistribution(tokenAddress, 100);
        setDistribution(data);
      } catch (err) {
        logger.error("Error loading holder distribution:", err);
        setError(err instanceof Error ? err.message : "Failed to load holder distribution");
      } finally {
        setLoading(false);
      }
    };

    loadDistribution();
  }, [tokenAddress]);

  const shortenAddress = (address: string) => {
    return `${address.slice(0, 8)}...${address.slice(-6)}`;
  };

  const unitLabel = tokenSymbol || "tokens";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !distribution) {
    return (
      <p className="text-[10px] font-mono text-destructive py-4">
        {error || "Failed to load holder distribution"}
      </p>
    );
  }

  if (distribution.holders.length === 0) {
    return (
      <p className="text-[10px] font-mono text-muted-foreground text-center py-6">
        No holder data available
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 gap-2">
        <div className="p-2.5 bg-muted/30 rounded-sm border border-border/50">
          <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Holders</div>
          <div className="text-xs font-mono tabular-nums font-semibold text-foreground">{distribution.totalHolders}</div>
        </div>
        <div className="p-2.5 bg-muted/30 rounded-sm border border-border/50">
          <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Top 10</div>
          <div className="text-xs font-mono tabular-nums font-semibold text-foreground">
            {distribution.top10Percentage.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Top Holders List */}
      <div className="space-y-1.5 max-h-72 overflow-y-auto no-scrollbar">
        {distribution.holders.map((holder, index) => {
          const isLiquidity =
            holder.address &&
            SOVRY_EXCHANGE_ADDRESS &&
            holder.address.toLowerCase() === SOVRY_EXCHANGE_ADDRESS.toLowerCase();
          const isCreator =
            !!creatorAddress && holder.address.toLowerCase() === creatorAddress.toLowerCase();

          return (
            <div
              key={holder.address}
              className="flex items-center justify-between p-2 bg-muted/20 rounded-sm border border-border/40"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center text-[10px] font-mono font-semibold text-primary flex-shrink-0">
                  {index + 1}
                </div>
                <div className="min-w-0">
                  <a
                    href={`${ADDRESS_EXPLORER_URL}${holder.address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] font-mono text-foreground flex items-center gap-1 hover:text-primary transition-colors"
                  >
                    {isLiquidity ? "Sovry Vault" : shortenAddress(holder.address)}
                    {isCreator && !isLiquidity && (
                      <span className="px-1 py-px rounded-sm bg-blue-500/10 text-[9px] font-mono text-blue-400 border border-blue-500/30">
                        Creator
                      </span>
                    )}
                  </a>
                  <div className="text-[10px] font-mono text-muted-foreground truncate">
                    {holder.balanceFormatted} {unitLabel}
                  </div>
                </div>
              </div>
              <div className="text-right flex-shrink-0 ml-2">
                <div className="text-[10px] font-mono tabular-nums font-semibold text-foreground">
                  {holder.percentage.toFixed(2)}%
                </div>
                <div
                  className="h-1 bg-primary/60 rounded-full mt-0.5"
                  style={{ width: `${Math.min(60, holder.percentage * 1.2)}px` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
