"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      <Card className="bg-card/80 border-border/80">
        <CardHeader>
          <CardTitle className="text-base sm:text-lg font-semibold">Holder Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-7 w-7 sm:h-8 sm:w-8 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !distribution) {
    return (
      <Card className="bg-card/80 border-border/80">
        <CardHeader>
          <CardTitle className="text-base sm:text-lg font-semibold">Holder Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm sm:text-base text-destructive">
            {error || "Failed to load holder distribution"}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (distribution.holders.length === 0) {
    return (
      <Card className="bg-card/80 border-border/80">
        <CardHeader>
          <CardTitle className="text-base sm:text-lg font-semibold">Holder Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm sm:text-base text-muted-foreground text-center py-8">
            No holder data available
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card/80 border-border/80">
      <CardHeader>
        <CardTitle className="text-base sm:text-lg font-semibold">Holder Distribution</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 text-sm sm:text-base">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 sm:p-4 bg-muted/40 rounded-lg border border-border/60">
            <div className="text-muted-foreground mb-1 text-xs sm:text-sm">Total Holders</div>
            <div className="text-lg sm:text-xl font-semibold text-foreground">{distribution.totalHolders}</div>
          </div>
          <div className="p-3 sm:p-4 bg-muted/40 rounded-lg border border-border/60">
            <div className="text-muted-foreground mb-1 text-xs sm:text-sm">Top 10 Concentration</div>
            <div className="text-lg sm:text-xl font-semibold text-foreground">
              {distribution.top10Percentage.toFixed(1)}%
            </div>
          </div>
        </div>

        {/* Top Holders List */}
        <div className="space-y-2.5">
          <h4 className="text-sm sm:text-base font-semibold text-foreground">Top Holders</h4>
          <div className="space-y-2 max-h-96 overflow-y-auto">
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
                  className="flex items-center justify-between p-3 sm:p-3.5 bg-muted/40 rounded border border-border/60"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-xs sm:text-sm font-semibold text-primary">
                      {index + 1}
                    </div>
                    <div className="flex flex-col">
                      <a
                        href={`${ADDRESS_EXPLORER_URL}${holder.address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs sm:text-sm font-mono text-foreground flex items-center gap-1 hover:text-primary transition-colors"
                      >
                        {isLiquidity ? "Sovry Vault" : shortenAddress(holder.address)}
                        {isCreator && !isLiquidity && (
                          <span className="px-1.5 py-0.5 rounded-full bg-blue-500/10 text-[11px] font-semibold text-blue-400 border border-blue-500/30">
                            Creator
                          </span>
                        )}
                      </a>
                      <span className="text-xs sm:text-sm text-muted-foreground">
                        {holder.balanceFormatted} {unitLabel}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs sm:text-sm font-semibold text-foreground">
                      {holder.percentage.toFixed(2)}%
                    </div>
                    <div
                      className="h-1.5 bg-primary rounded-full mt-1"
                      style={{ width: `${Math.min(100, holder.percentage * 2)}px` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Concentration Metrics */}
        <div className="pt-4 border-t border-border/60 space-y-2">
          <div className="flex justify-between text-xs sm:text-sm">
            <span className="text-muted-foreground">Top 10 Holders</span>
            <span className="font-semibold text-foreground">
              {distribution.top10Percentage.toFixed(1)}%
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
