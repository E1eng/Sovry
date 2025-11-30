"use client";

import Link from "next/link";
import { TrendingUp, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TrendingFloatProps {
  assetName?: string;
  assetSymbol?: string;
  assetImage?: string;
  priceChange?: number;
  marketCap?: string;
}

export function TrendingFloat({
  assetName = "Pilosos",
  assetSymbol = "PILO",
  assetImage,
  priceChange = 24.5,
  marketCap = "$1.2M",
}: TrendingFloatProps) {
  return (
    <div className="absolute top-20 right-8 z-30 hidden lg:block">
      <Link href="/pool/trending">
        <div className="w-72 bg-zinc-900/50 backdrop-blur-md border border-zinc-800 rounded-xl p-4 shadow-xl hover:border-sovry-green/50 transition-all duration-300 group cursor-pointer">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-sovry-green" />
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                Trending Now
              </span>
            </div>
            <ArrowRight className="h-4 w-4 text-zinc-400 group-hover:text-sovry-green transition-colors" />
          </div>

          {/* Asset Info */}
          <div className="flex items-center gap-3 mb-3">
            {assetImage ? (
              <div className="w-12 h-12 rounded-lg overflow-hidden border border-zinc-800 flex-shrink-0">
                <img
                  src={assetImage}
                  alt={assetName}
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-sovry-green/20 to-sovry-pink/20 border border-zinc-800 flex items-center justify-center flex-shrink-0">
                <span className="text-lg font-bold text-sovry-green">{assetSymbol[0]}</span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-zinc-50 truncate">
                {assetName}
              </div>
              <div className="text-xs text-zinc-400 font-mono">
                {assetSymbol}
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-zinc-400 mb-1">Market Cap</div>
              <div className="text-sm font-semibold text-zinc-50">{marketCap}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-zinc-400 mb-1">24h Change</div>
              <div className={`text-sm font-semibold ${priceChange >= 0 ? 'text-sovry-green' : 'text-sovry-pink'}`}>
                {priceChange >= 0 ? '+' : ''}{priceChange}%
              </div>
            </div>
          </div>

          {/* View Button */}
          <Button
            variant="outline"
            size="sm"
            className="w-full mt-3"
            onClick={(e) => {
              e.preventDefault();
              window.location.href = "/pool/trending";
            }}
          >
            View Asset
          </Button>
        </div>
      </Link>
    </div>
  );
}

