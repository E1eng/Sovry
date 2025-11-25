"use client";

import Link from "next/link";
import TokenLogo from "@/components/ui/TokenLogo";
import { Badge } from "@/components/ui/badge";
import { formatMarketCap } from "@/services/launchDataService";

export interface LaunchCardData {
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

interface LaunchCardProps {
  launch: LaunchCardData;
}

const categoryColors: Record<string, string> = {
  Art: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  Music: "bg-pink-500/10 text-pink-600 border-pink-500/20",
  Gaming: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  Photography: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  "3D Art": "bg-cyan-500/10 text-cyan-600 border-cyan-500/20",
  "Commercial IP": "bg-green-500/10 text-green-600 border-green-500/20",
  "Personal IP": "bg-orange-500/10 text-orange-600 border-orange-500/20",
  "IP Asset": "bg-gray-500/10 text-gray-600 border-gray-500/20",
};

export default function LaunchCard({ launch }: LaunchCardProps) {
  const address = launch.token || launch.id;
  const createdAtDate = launch.createdAt
    ? new Date(launch.createdAt * 1000)
    : null;
  
  const categoryColor = categoryColors[launch.category || "IP Asset"] || categoryColors["IP Asset"];
  const bondingProgress = launch.bondingProgress || 0;
  const displaySymbol = launch.symbol || address.slice(2, 6).toUpperCase();
  const displayName = launch.name || `Token ${address.slice(0, 6)}`;

  return (
    <Link
      href={`/pool/${address}`}
      className="group rounded-2xl border border-border/60 bg-card/70 hover:border-primary/60 hover:bg-card transition-all duration-200 shadow-sm overflow-hidden flex flex-col hover:shadow-md"
    >
      {/* Image Section */}
      <div className="relative h-40 sm:h-48 bg-gradient-to-br from-indigo-500/40 via-purple-500/30 to-emerald-500/40 overflow-hidden">
        {launch.imageUrl || launch.ipId ? (
          <div className="absolute inset-0">
            <img
              src={launch.imageUrl || undefined}
              alt={displayName}
              className="w-full h-full object-cover"
              onError={(e) => {
                // Fallback to gradient on error
                const target = e.target as HTMLImageElement;
                target.style.display = "none";
                if (target.parentElement) {
                  target.parentElement.className += " bg-gradient-to-br from-indigo-500/40 via-purple-500/30 to-emerald-500/40";
                }
              }}
            />
          </div>
        ) : (
          <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.35),_transparent_60%)]" />
        )}
        
        {/* Overlay with Token Info */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between">
          <div className="flex items-center gap-2">
            <TokenLogo
              tokenAddress={address}
              ipId={launch.ipId}
              fallbackName={displaySymbol}
              size="md"
              className="border-2 border-background/80"
            />
            <div>
              <div className="text-sm font-semibold text-white truncate max-w-[10rem]">
                {displaySymbol}
              </div>
              <div className="text-xs text-white/80">
                {displayName.length > 20 ? `${displayName.slice(0, 20)}...` : displayName}
              </div>
            </div>
          </div>
          {launch.category && (
            <Badge
              variant="outline"
              className={`${categoryColor} text-xs border`}
            >
              {launch.category}
            </Badge>
          )}
        </div>
      </div>

      {/* Content Section */}
      <div className="p-4 flex-1 flex flex-col gap-3">
        {/* Market Cap */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Market Cap</p>
            <p className="text-base font-semibold text-foreground">
              {formatMarketCap(launch.marketCap)}
            </p>
          </div>
          {launch.currentPrice && (
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Price</p>
              <p className="text-sm font-medium text-foreground">
                {parseFloat(launch.currentPrice).toFixed(4)} IP
              </p>
            </div>
          )}
        </div>

        {/* Bonding Curve Progress */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs text-muted-foreground">Bonding Curve Progress</p>
            <p className="text-xs font-medium text-foreground">{bondingProgress.toFixed(1)}%</p>
          </div>
          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary to-primary/80 transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(0, bondingProgress))}%` }}
            />
          </div>
        </div>

        {/* Footer Info */}
        <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-2 border-t border-border/40">
          <div className="flex items-center gap-1.5">
            <span>Creator</span>
            <span className="font-mono">
              {launch.creator.slice(0, 6)}…{launch.creator.slice(-4)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {createdAtDate && (
              <span>{createdAtDate.toLocaleDateString()}</span>
            )}
            <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary border-primary/20">
              Launchpad
            </Badge>
          </div>
        </div>
      </div>
    </Link>
  );
}

