"use client";

import Image from "next/image";
import Link from "next/link";
import { formatMarketCapIP, truncateAddress } from "@/lib/utils";

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

export default function AssetCard({ launch }: AssetCardProps) {
  const address = launch.token || launch.id;
  const bondingProgress = launch.bondingProgress || 0;
  const symbolFallback = truncateAddress(address, {
    start: 4,
    end: 0,
    stripPrefix: true,
    minLength: 4,
  }).toUpperCase();
  const nameFallback = truncateAddress(address, { start: 6, end: 0, minLength: 6 });
  const displaySymbol = launch.symbol || symbolFallback;
  const displayName = launch.name || `Token ${nameFallback}`;
  const formattedMarketCap = formatMarketCapIP(launch.marketCap);
  const creatorShort = truncateAddress(launch.creator, {
    start: 6,
    end: 0,
    stripPrefix: true,
    minLength: 6,
  });
  const timeAgoStr = launch.createdAt ? timeAgo(launch.createdAt) : "";
  const statusLabel = launch.graduated ? "Graduated" : "Live";
  const statusClasses = launch.graduated
    ? "border-secondary/60 text-secondary bg-secondary/10"
    : "border-primary/60 text-primary bg-primary/10";
  const shortId = truncateAddress(address);

  return (
    <Link
      href={`/pool/${address}`}
      className="group flex flex-col overflow-hidden rounded-sm border border-border bg-card transition-colors hover:border-primary/50"
    >
      {/* Media */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
        {launch.imageUrl ? (
          <Image
            src={launch.imageUrl}
            alt={displayName}
            fill
            className="object-cover"
            onError={(e) => {
              const target = e.currentTarget;
              target.style.display = "none";
            }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xl font-semibold text-muted-foreground">
              {displayName.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
      </div>

      {/* Metadata */}
      <div className="flex flex-col gap-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground truncate">
              {displayName}
            </div>
            <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
              {displaySymbol}
            </div>
          </div>
          <span
            className={
              `inline-flex items-center border px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.2em] ${statusClasses}`
            }
          >
            {statusLabel}
          </span>
        </div>

        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="font-mono tabular-nums">ID {shortId}</span>
          <span className="font-mono tabular-nums">MC {formattedMarketCap}</span>
        </div>

        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="font-mono">{creatorShort}</span>
          <span className="font-mono tabular-nums">
            {timeAgoStr || "—"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="h-1 w-full bg-muted">
            <div
              className="h-full bg-primary"
              style={{ width: `${Math.max(0, Math.min(100, bondingProgress))}%` }}
            />
          </div>
          <span className="text-[11px] font-mono text-foreground tabular-nums">
            {Math.max(0, Math.min(100, bondingProgress)).toFixed(1)}%
          </span>
        </div>
      </div>
    </Link>
  );
}

