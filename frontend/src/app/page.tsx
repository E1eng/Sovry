"use client";

import { useState, useRef, useEffect } from "react";
import { ImmersiveHero } from "@/components/hero/ImmersiveHero";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Filter, LayoutGrid, List, Settings, Radio } from "lucide-react";
import AssetCard from "@/components/marketplace/AssetCard";
import { LaunchCard } from "@/components/LaunchCard";
import { LaunchCardSkeleton } from "@/components/LaunchCardSkeleton";
import { useLaunches } from "@/hooks/useLaunches";
import { formatMarketCap } from "@/services/launchDataService";
import { cn } from "@/lib/utils";

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
          <h2 id="now-trending-heading" className="text-lg font-semibold text-sovry-green">
            Now trending
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => scroll("left")}
              className="p-1.5 rounded-lg border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800 transition-colors"
              aria-label="Scroll left"
            >
              <ChevronLeft className="h-4 w-4 text-zinc-400" />
            </button>
            <button
              onClick={() => scroll("right")}
              className="p-1.5 rounded-lg border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800 transition-colors"
              aria-label="Scroll right"
            >
              <ChevronRight className="h-4 w-4 text-zinc-400" />
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
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 text-center space-y-3">
            <p className="text-sm text-zinc-400">{error}</p>
            <Button
              onClick={retry}
              variant="outline"
              size="sm"
              className="border-zinc-800 hover:border-sovry-green/50"
            >
              Retry
            </Button>
          </div>
        ) : activeLaunches.length === 0 ? (
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 text-center">
            <p className="text-sm text-zinc-400">No trending tokens yet.</p>
          </div>
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
              const marketCap = formatMarketCap(launch.marketCap);
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
      <div id="explore" className="px-3 sm:px-4 md:px-6 py-4 sm:py-6 space-y-3 sm:space-y-4">
        {/* Tabs: Explore / Watchlist */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-6">
            <button
              onClick={() => setActiveTab("explore")}
              className={cn(
                "text-base font-medium transition-colors",
                activeTab === "explore"
                  ? "text-zinc-50"
                  : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              Explore
            </button>
            <button
              onClick={() => setActiveTab("graduated")}
              className={cn(
                "text-base font-medium transition-colors",
                activeTab === "graduated"
                  ? "text-zinc-50"
                  : "text-zinc-500 hover:text-zinc-300"
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
                  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                  selectedFilter === option.id
                    ? "bg-sovry-green text-black"
                    : "bg-zinc-900 text-zinc-400 border border-zinc-800 hover:border-zinc-700"
                )}
              >
                {option.icon && (
                  <option.icon className={cn(
                    "h-3 w-3",
                    option.id === "live" && "text-red-500"
                  )} />
                )}
                {option.label}
              </button>
            ))}
          </div>

          {/* Right side: Filter button + View toggle + Settings */}
          <div className="flex items-center gap-2">
            <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 text-zinc-400 border border-zinc-800 hover:border-zinc-700">
              <Filter className="h-3 w-3" />
              Filter
            </button>
            <div className="flex items-center border border-zinc-800 rounded-lg overflow-hidden">
              <button
                onClick={() => setViewMode("grid")}
                className={cn(
                  "p-1.5 transition-colors",
                  viewMode === "grid" ? "bg-zinc-800 text-zinc-50" : "text-zinc-500 hover:text-zinc-300"
                )}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={cn(
                  "p-1.5 transition-colors",
                  viewMode === "list" ? "bg-zinc-800 text-zinc-50" : "text-zinc-500 hover:text-zinc-300"
                )}
              >
                <List className="h-4 w-4" />
              </button>
            </div>
            <button className="p-1.5 rounded-lg border border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700">
              <Settings className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center gap-3">
              <div className="h-5 w-5 border-2 border-sovry-green border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-zinc-400">Loading tokens...</span>
            </div>
          </div>
        ) : visibleLaunches.length === 0 ? (
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-8 text-center">
            <p className="text-sm text-zinc-400">
              {activeTab === "explore" ? "No tokens found yet." : "No graduated tokens yet."}
            </p>
          </div>
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
