"use client";

import Image from "next/image";
import Link from "next/link";
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
  priceChange?: number;
}

interface AssetCardProps {
  launch: AssetCardData;
}

// Helper to format time ago
function timeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp * 1000;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "just now";
}

// Helper to truncate address
function truncateAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(2, 8)}`;
}

export default function AssetCard({ launch }: AssetCardProps) {
  const address = launch.token || launch.id;
  const bondingProgress = launch.bondingProgress || 0;
  const displaySymbol = launch.symbol || address.slice(2, 6).toUpperCase();
  const displayName = launch.name || `Token ${address.slice(0, 6)}`;
  const formattedMarketCap = launch.marketCap ? formatMarketCap(launch.marketCap) : "$0";
  const creatorShort = truncateAddress(launch.creator);
  const timeAgoStr = launch.createdAt ? timeAgo(launch.createdAt) : "";

  return (
    <Link
      href={`/pool/${address}`}
      className="group relative flex flex-row items-stretch rounded-xl border border-zinc-800/80 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 overflow-hidden hover:border-sovry-green/70 hover:shadow-[0_0_40px_rgba(34,197,94,0.25)] hover:bg-zinc-900/95 transition-all duration-200"
    >
      {/* Left - Image Section (square) */}
      <div className="relative w-28 sm:w-32 lg:w-36 aspect-square bg-zinc-900/80 overflow-hidden flex-shrink-0">
        {launch.imageUrl ? (
          <Image
            src={launch.imageUrl}
            alt={displayName}
            width={144}
            height={144}
            className="w-full h-full object-cover"
            onError={(e) => {
              const target = e.currentTarget;
              target.style.display = "none";
            }}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-sovry-green/20 via-zinc-800 to-sovry-pink/20 flex items-center justify-center">
            <span className="text-2xl font-bold text-zinc-500">
              {displayName.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
      </div>

      {/* Right - Content Section */}
      <div className="flex-1 p-3 sm:p-4 flex flex-col justify-between min-w-0 gap-2">
        {/* Top: Name + Symbol */}
        <div className="space-y-0.5">
          <h3 className="text-sm sm:text-base font-semibold text-zinc-50 truncate leading-snug">
            {displayName}
          </h3>
          <p className="text-[11px] sm:text-xs text-zinc-500 font-medium uppercase">
            {displaySymbol}
          </p>
        </div>

        {/* Middle: Creator + Time */}
        <div className="flex items-center gap-1.5 text-[11px] sm:text-xs text-zinc-500 mt-1">
          <div className="h-4 w-4 rounded-full bg-sovry-green/20 flex items-center justify-center">
            <span className="text-[8px] text-sovry-green font-bold">
              {creatorShort.charAt(0).toUpperCase()}
            </span>
          </div>
          <span className="truncate">{creatorShort}</span>
          <span className="text-zinc-600">•</span>
          <span>{timeAgoStr}</span>
        </div>

        {/* Bottom: MC + Bonding Progress */}
        <div className="flex items-center gap-2 mt-2">
          <span className="text-[11px] sm:text-xs text-zinc-400 font-medium whitespace-nowrap">
            MC {formattedMarketCap}
          </span>
          <div className="flex-1 flex items-center gap-2 min-w-0">
            <div className="flex-1 h-1.5 rounded-full bg-zinc-800/80 overflow-hidden">
              <div
                className="h-full rounded-full bg-sovry-green transition-all duration-300"
                style={{ width: `${Math.max(0, Math.min(100, bondingProgress))}%` }}
              />
            </div>
            <span className="text-[11px] sm:text-xs font-semibold text-zinc-100 whitespace-nowrap">
              {Math.max(0, Math.min(100, bondingProgress)).toFixed(1)}%
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

