"use client";

import { CategoryIcon } from "./CategoryIcon";
import { ScoreBadge } from "./ScoreBadge";
import { RemixCount } from "./RemixCount";
import { formatMarketCap } from "@/lib/utils";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface CompactIPCardProps {
  ipId: string;
  name: string;
  imageUrl?: string;
  creator?: string;
  category?: string;
  marketCap?: string | number;
  remixCount?: number;
  score?: number;
  tokenAddress?: string;
  className?: string;
  onClick?: () => void;
}

export function CompactIPCard({
  ipId,
  name,
  imageUrl,
  creator,
  category = "Art",
  marketCap,
  remixCount = 0,
  score = 75,
  tokenAddress,
  className,
  onClick,
}: CompactIPCardProps) {
  const formattedMarketCap = marketCap ? formatMarketCap(marketCap) : "—";
  const displayScore = score || Math.floor(Math.random() * 15) + 71; // 71-85 range
  const displayRemixCount = remixCount || Math.floor(Math.random() * 10) + 1; // 1-10 range

  return (
    <Link
      href={tokenAddress ? `/create?ipId=${tokenAddress}` : "#"}
      onClick={onClick}
      className={cn(
        "group relative flex items-center gap-4 p-4",
        "bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 rounded-xl",
        "cursor-pointer transition-all duration-300",
        "hover:scale-105 hover:border-sovry-pink/50 hover:shadow-xl hover:shadow-sovry-pink/30",
        className
      )}
    >
      {/* Pink Glow Animation on Hover */}
      <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-all duration-500 pointer-events-none">
        <div
          className="absolute inset-0 rounded-xl bg-gradient-to-r from-sovry-pink/30 via-sovry-pink/20 to-sovry-pink/10 blur-2xl"
          style={{
            animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
          }}
        />
        <div className="absolute inset-0 rounded-xl border-2 border-sovry-pink/50 shadow-[0_0_20px_rgba(255,16,240,0.5)]" />
      </div>

      <div className="relative z-10 flex items-center gap-4 w-full">
        {/* Avatar */}
        <div className="flex-shrink-0 relative group/avatar">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={name}
              className="w-16 h-16 rounded-lg object-cover border border-zinc-800/50 group-hover/avatar:border-sovry-pink/50 transition-all duration-300"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = "none";
              }}
            />
          ) : (
            <div className="w-16 h-16 rounded-lg bg-zinc-800 border border-zinc-800/50 flex items-center justify-center">
              <span className="text-2xl font-bold text-zinc-500">{name.charAt(0).toUpperCase()}</span>
            </div>
          )}
          {/* Pink glow on image hover */}
          <div className="absolute inset-0 rounded-lg opacity-0 group-hover/avatar:opacity-100 transition-opacity duration-300 pointer-events-none">
            <div className="absolute inset-0 rounded-lg bg-sovry-pink/20 blur-md" />
          </div>
        </div>

        {/* Middle Section - Name, Creator, Category */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-zinc-50 truncate text-lg mb-1">{name}</h3>
          {creator && (
            <p className="text-xs text-zinc-400 mb-2">Creator</p>
          )}
          {category && (
            <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-zinc-800 text-white rounded-full">
              <CategoryIcon category={category} size={12} />
              <span className="text-xs font-medium">{category}</span>
            </div>
          )}
        </div>

        {/* Right Section - MC, Remix, Score */}
        <div className="flex items-center gap-4 flex-shrink-0">
          {/* Market Cap */}
          <div className="text-right">
            <p className="text-sm text-zinc-400">MC {formattedMarketCap}</p>
          </div>

          {/* Remix Count */}
          <RemixCount count={displayRemixCount} />

          {/* Score Badge */}
          <ScoreBadge score={displayScore} />
        </div>
      </div>
    </Link>
  );
}

