"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { getHolderDistribution, type HolderDistribution } from "@/services/holderService";

interface HolderDistributionProps {
  tokenAddress: string;
}

export default function HolderDistribution({ tokenAddress }: HolderDistributionProps) {
  const [distribution, setDistribution] = useState<HolderDistribution | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadDistribution = async () => {
      if (!tokenAddress) return;

      setLoading(true);
      setError(null);

      try {
        const data = await getHolderDistribution(tokenAddress, 20);
        setDistribution(data);
      } catch (err) {
        console.error("Error loading holder distribution:", err);
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

  if (loading) {
    return (
      <Card className="bg-card/80 border-border/80">
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Holder Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !distribution) {
    return (
      <Card className="bg-card/80 border-border/80">
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Holder Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-red-400">
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
          <CardTitle className="text-sm font-semibold">Holder Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">
            No holder data available
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card/80 border-border/80">
      <CardHeader>
        <CardTitle className="text-sm font-semibold">Holder Distribution</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div className="p-3 bg-muted/40 rounded-lg border border-border/60">
            <div className="text-muted-foreground mb-1">Total Holders</div>
            <div className="text-lg font-semibold text-foreground">{distribution.totalHolders}</div>
          </div>
          <div className="p-3 bg-muted/40 rounded-lg border border-border/60">
            <div className="text-muted-foreground mb-1">Top 10 Concentration</div>
            <div className="text-lg font-semibold text-foreground">
              {distribution.top10Percentage.toFixed(1)}%
            </div>
          </div>
        </div>

        {/* Top Holders List */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-foreground">Top Holders</h4>
          <div className="space-y-1 max-h-96 overflow-y-auto">
            {distribution.holders.map((holder, index) => (
              <div
                key={holder.address}
                className="flex items-center justify-between p-2 bg-muted/40 rounded border border-border/60"
              >
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-semibold text-primary">
                    {index + 1}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-mono text-foreground">
                      {shortenAddress(holder.address)}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {parseFloat(holder.balanceFormatted).toFixed(4)} tokens
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-semibold text-foreground">
                    {holder.percentage.toFixed(2)}%
                  </div>
                  <div
                    className="h-1.5 bg-primary rounded-full mt-1"
                    style={{ width: `${Math.min(100, holder.percentage * 2)}px` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Concentration Metrics */}
        <div className="pt-4 border-t border-border/60 space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Top 10 Holders</span>
            <span className="font-semibold text-foreground">
              {distribution.top10Percentage.toFixed(1)}%
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Top 20 Holders</span>
            <span className="font-semibold text-foreground">
              {distribution.top20Percentage.toFixed(1)}%
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

