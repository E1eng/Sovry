"use client";

import { useState, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import { ActionBtn } from "@/components/ui/ActionBtn";
import { TerminalCard } from "@/components/ui/TerminalCard";
import { ChevronLeft, ChevronRight, Filter, LayoutGrid, List, Settings, Radio } from "lucide-react";
import AssetCard from "@/components/marketplace/AssetCard";
import { LaunchCardSkeleton } from "@/components/LaunchCardSkeleton";
import { useLaunches } from "@/hooks/useLaunches";
import { cn, formatMarketCapIP } from "@/lib/utils";

const ImmersiveHero = dynamic(
  () => import("@/components/hero/ImmersiveHero").then((m) => m.ImmersiveHero),
  { ssr: false }
);

const LaunchCard = dynamic(
  () => import("@/components/LaunchCard").then((m) => m.LaunchCard),
  { ssr: false, loading: () => <LaunchCardSkeleton /> }
);

// Filter options
const FILTER_OPTIONS = [
  { id: "live", label: "Live", icon: Radio },
  { id: "new", label: "New", icon: null },
  { id: "market-cap", label: "Market cap", icon: null },
  { id: "oldest", label: "Oldest", icon: null },
] as const;

type FilterOption = (typeof FILTER_OPTIONS)[number]["id"];

// Now Trending Section Component (Franklin-style cards)
function NowTrendingSection() {
  const { launches, loading, error, retry } = useLaunches(8);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      const scrollAmount = 300;
      scrollRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
  };

  // Filter to active (non-graduated) launches
  const activeLaunches = launches.filter((launch) => !launch.graduated);

  return (
    <section className="px-3 sm:px-4 md:px-6 py-4 sm:py-6" aria-labelledby="now-trending-heading">
      <div className="w-full space-y-4">
        {/* Section Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h2
              id="now-trending-heading"
              className="text-sm font-semibold uppercase tracking-[0.2em] text-foreground"
            >
              Now trending
            </h2>
            <p className="text-xs text-muted-foreground">
              Live launches gaining momentum right now.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => scroll("left")}
              className="inline-flex h-8 w-8 items-center justify-center border border-border bg-card text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
              aria-label="Scroll left"
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
            </button>
            <button
              onClick={() => scroll("right")}
              className="inline-flex h-8 w-8 items-center justify-center border border-border bg-card text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
              aria-label="Scroll right"
            >
              <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </div>
        </div>

        {/* Trending Cards Horizontal Carousel */}
        {loading ? (
          <div
            ref={scrollRef}
            className="flex gap-3 overflow-x-auto no-scrollbar pb-2 -mx-1 px-1"
          >
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="min-w-[240px] sm:min-w-[260px] md:min-w-[280px] flex-none"
              >
                <LaunchCardSkeleton />
              </div>
            ))}
          </div>
        ) : error ? (
          <TerminalCard className="p-6 text-center space-y-3">
            <p className="text-sm text-muted-foreground">{error}</p>
            <ActionBtn onClick={retry} tone="ghost" className="text-[10px]">
              Retry
            </ActionBtn>
          </TerminalCard>
        ) : activeLaunches.length === 0 ? (
          <TerminalCard className="p-6 text-center">
            <p className="text-sm text-muted-foreground">No trending tokens yet.</p>
          </TerminalCard>
        ) : (
          <div
            ref={scrollRef}
            className="flex gap-3 overflow-x-auto no-scrollbar pb-2 -mx-1 px-1"
            role="list"
          >
            {activeLaunches.slice(0, 8).map((launch) => {
              const image = launch.imageUrl || "";
              const ticker = launch.name || "TOKEN";
              const symbol = launch.symbol;
              const marketCap = formatMarketCapIP(launch.marketCap);
              const bondingCurvePercent = launch.bondingProgress || 0;
              const createdBy = launch.creator || "";
              const tokenAddress = launch.token || launch.id;

              return (
                <div
                  key={tokenAddress}
                  role="listitem"
                  className="min-w-[240px] sm:min-w-[260px] md:min-w-[280px] flex-none"
                >
                  <LaunchCard
                    image={image}
                    ticker={ticker}
                    symbol={symbol}
                    marketCap={marketCap}
                    bondingCurvePercent={bondingCurvePercent}
                    createdBy={createdBy}
                    tokenAddress={tokenAddress}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<"explore" | "graduated">("explore");
  const [selectedFilter, setSelectedFilter] = useState<FilterOption>("live");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const { launches, loading } = useLaunches(24);

  const liveLaunches = launches.filter((launch) => !launch.graduated);
  const graduatedLaunches = launches.filter((launch) => launch.graduated);
  const heroCandidates = liveLaunches.length > 0 ? liveLaunches : launches;

  // Token count for hero section
  const totalTokens = launches.length;
  const [heroIndex, setHeroIndex] = useState(0);

  useEffect(() => {
    if (!heroCandidates.length) return;

    const interval = setInterval(() => {
      setHeroIndex((prev) => (prev + 1) % heroCandidates.length);
    }, 8000); // ganti card tiap 8 detik

    return () => clearInterval(interval);
  }, [heroCandidates.length]);

  const heroSample = heroCandidates.length > 0 ? heroCandidates[heroIndex % heroCandidates.length] : undefined;
  const visibleLaunches = activeTab === "explore" ? liveLaunches : graduatedLaunches;

  const sortedLaunches = (() => {
    const items = [...visibleLaunches];

    if (selectedFilter === "market-cap") {
      items.sort((a, b) => {
        const aCap = Number.parseFloat(a.marketCap || "0");
        const bCap = Number.parseFloat(b.marketCap || "0");
        const aVal = Number.isFinite(aCap) ? aCap : 0;
        const bVal = Number.isFinite(bCap) ? bCap : 0;
        return bVal - aVal;
      });
      return items;
    }

    if (selectedFilter === "oldest") {
      items.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      return items;
    }

    // "live" and "new" both default to newest-first ordering.
    items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return items;
  })();

  return (
    <>
      {/* Hero Section */}
      <ImmersiveHero
        tokenCount={totalTokens}
        liveCount={liveLaunches.length}
        sampleLaunch={
          heroSample
            ? {
                name: heroSample.name,
                symbol: heroSample.symbol,
                marketCap: heroSample.marketCap,
                bondingProgress: heroSample.bondingProgress,
                imageUrl: heroSample.imageUrl,
              }
            : undefined
        }
      />

      {/* Now Trending Section */}
      <NowTrendingSection />

      {/* Explore Section */}
      <div
        id="explore"
        className="px-3 sm:px-4 md:px-6 py-4 sm:py-6 space-y-3 sm:space-y-4 border-t border-border"
      >
        {/* Tabs: Explore / Watchlist */}
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setActiveTab("explore")}
              className={cn(
                "text-[11px] font-semibold uppercase tracking-[0.2em] transition-colors",
                activeTab === "explore"
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Explore
            </button>
            <button
              onClick={() => setActiveTab("graduated")}
              className={cn(
                "text-[11px] font-semibold uppercase tracking-[0.2em] transition-colors",
                activeTab === "graduated"
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Graduated
            </button>
          </div>
        </div>

        {/* Filter Pills Row */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            {FILTER_OPTIONS.map((option) => (
              <button
                key={option.id}
                onClick={() => setSelectedFilter(option.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 border border-border px-3 py-1 text-[10px] font-mono uppercase tracking-[0.2em] transition-colors",
                  selectedFilter === option.id
                    ? "bg-primary text-black border-primary/60"
                    : "bg-card text-muted-foreground hover:text-foreground hover:border-primary/40"
                )}
              >
                {option.icon && (
                  <option.icon
                    className={cn("h-3 w-3", option.id === "live" && "text-secondary")}
                    strokeWidth={1.5}
                  />
                )}
                {option.label}
              </button>
            ))}
          </div>

          {/* Right side: Filter button + View toggle + Settings */}
          <div className="flex items-center gap-2">
            <button className="inline-flex items-center gap-1.5 border border-border bg-card px-3 py-1 text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground hover:border-primary/40">
              <Filter className="h-3 w-3" strokeWidth={1.5} />
              Filter
            </button>
            <div className="flex items-center border border-border">
              <button
                onClick={() => setViewMode("grid")}
                className={cn(
                  "px-2 py-1 text-muted-foreground transition-colors",
                  viewMode === "grid" ? "bg-muted text-foreground" : "hover:text-foreground"
                )}
              >
                <LayoutGrid className="h-4 w-4" strokeWidth={1.5} />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={cn(
                  "px-2 py-1 text-muted-foreground transition-colors",
                  viewMode === "list" ? "bg-muted text-foreground" : "hover:text-foreground"
                )}
              >
                <List className="h-4 w-4" strokeWidth={1.5} />
              </button>
            </div>
            <button className="inline-flex h-8 w-8 items-center justify-center border border-border bg-card text-muted-foreground transition-colors hover:text-foreground hover:border-primary/40">
              <Settings className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </div>
        </div>

        {/* Content Grid */}
        {loading ? (
          <TerminalCard className="py-12">
            <div className="flex items-center justify-center gap-3 text-muted-foreground">
              <div className="h-4 w-4 border-2 border-primary border-t-transparent animate-spin" />
              <span className="text-xs uppercase tracking-[0.2em]">Loading tokens</span>
            </div>
          </TerminalCard>
        ) : visibleLaunches.length === 0 ? (
          <TerminalCard className="p-8 text-center">
            <p className="text-sm text-muted-foreground">
              {activeTab === "explore" ? "No tokens found yet." : "No graduated tokens yet."}
            </p>
          </TerminalCard>
        ) : (
          <div
            className={cn(
              "grid gap-3",
              viewMode === "grid" ? "sm:grid-cols-2 lg:grid-cols-3" : "grid-cols-1"
            )}
          >
            {sortedLaunches.map((launch) => (
              <AssetCard key={launch.token || launch.id} launch={launch} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
