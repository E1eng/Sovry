"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatMarketCap } from "@/services/launchDataService";

export interface AssetCardData {
  id: string;
  token: string;
  creator: string;
  createdAt: number;
  symbol?: string;
  name?: string;
  ipId?: string;
  imageUrl?: string;
  marketCap?: string;
  bondingProgress?: number;
  category?: string;
  currentPrice?: string;
}

interface AssetCardProps {
  launch: AssetCardData;
}

const categoryColors: Record<string, string> = {
  Art: "bg-sovry-pink/10 text-sovry-pink border-sovry-pink/20",
  Music: "bg-sovry-pink/10 text-sovry-pink border-sovry-pink/20",
  Gaming: "bg-sovry-green/10 text-sovry-green border-sovry-green/20",
  Photography: "bg-sovry-pink/10 text-sovry-pink border-sovry-pink/20",
  "3D Art": "bg-sovry-green/10 text-sovry-green border-sovry-green/20",
  "Commercial IP": "bg-sovry-green/10 text-sovry-green border-sovry-green/20",
  "Personal IP": "bg-sovry-pink/10 text-sovry-pink border-sovry-pink/20",
  "IP Asset": "bg-zinc-800/30 text-zinc-400 border-zinc-700",
};

export default function AssetCard({ launch }: AssetCardProps) {
  const address = launch.token || launch.id;
  const createdAtDate = launch.createdAt
    ? new Date(launch.createdAt * 1000)
    : null;
  
  const categoryColor = categoryColors[launch.category || "IP Asset"] || categoryColors["IP Asset"];
  const bondingProgress = launch.bondingProgress || 0;
  const displaySymbol = launch.symbol || address.slice(2, 6).toUpperCase();
  const displayName = launch.name || `Token ${address.slice(0, 6)}`;

  // Category emoji mapping
  const categoryEmoji: Record<string, string> = {
    Art: "🎨",
    Music: "🎵",
    Gaming: "🎮",
    Photography: "📷",
    "3D Art": "🎭",
    "Commercial IP": "💼",
    "Personal IP": "👤",
    "IP Asset": "📦",
    "AI Agent": "🤖",
    Meme: "😄",
  };

  const categoryEmojiIcon = categoryEmoji[launch.category || "IP Asset"] || "📦";

  return (
    <Link
      href={`/pool/${address}`}
      className="group relative rounded-xl border border-zinc-800 overflow-hidden bg-zinc-900/50 backdrop-blur-sm hover:border-sovry-green/50 transition-all duration-300 hover:shadow-lg hover:shadow-sovry-green/10"
    >
      {/* Image Section - 16:9 Aspect Ratio */}
      <div className="relative w-full aspect-video bg-gradient-to-br from-sovry-green/20 via-sovry-green/10 to-sovry-pink/20 overflow-hidden">
        {launch.imageUrl || launch.ipId ? (
          <div className="absolute inset-0">
            <img
              src={launch.imageUrl || undefined}
              alt={displayName}
              className="w-full h-full object-cover"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = "none";
              }}
            />
          </div>
        ) : (
          <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_top,_rgba(57,255,20,0.35),_transparent_60%)]" />
        )}
        
        {/* Badge - Top Left: Bonding Curve % in Hot Pink */}
        <div className="absolute top-3 left-3">
          <div className="px-3 py-1.5 rounded-lg bg-sovry-pink/90 backdrop-blur-sm border border-sovry-pink/50 shadow-lg">
            <span className="text-xs font-bold text-white">
              {Math.round(bondingProgress)}%
            </span>
          </div>
        </div>

        {/* Badge - Top Right: Category Icon in Glass Badge */}
        {launch.category && (
          <div className="absolute top-3 right-3">
            <div className="px-2.5 py-1.5 rounded-lg bg-zinc-900/80 backdrop-blur-sm border border-zinc-800">
              <span className="text-sm">{categoryEmojiIcon}</span>
            </div>
          </div>
        )}

        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/80 via-transparent to-transparent" />
      </div>

      {/* Footer - Minimal: Token Name and Ticker */}
      <div className="p-4 bg-zinc-900/50">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-zinc-50 truncate">
              {displayName}
            </div>
            <div className="text-xs text-zinc-400 font-mono">
              {displaySymbol}
            </div>
          </div>
          {/* Buy Button - Revealed on Hover */}
          <Button
            variant="buy"
            className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-xs px-4 py-1.5"
            onClick={(e) => {
              e.preventDefault();
              window.location.href = `/pool/${address}`;
            }}
          >
            Buy
          </Button>
        </div>
      </div>
    </Link>
  );
}

