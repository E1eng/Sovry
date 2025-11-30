"use client";

import { useState, useEffect, useMemo } from "react";
import { ImmersiveHero } from "@/components/hero/ImmersiveHero";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DynamicWidget } from "@dynamic-labs/sdk-react-core";
import { PlusCircle, Search, Rocket, ArrowRight } from "lucide-react";
import Link from "next/link";
import { enrichLaunchesData } from "@/services/launchDataService";
import { CategoryPills } from "@/components/marketplace/CategoryPills";
import AssetCard, { type AssetCardData } from "@/components/marketplace/AssetCard";
import { LaunchCard } from "@/components/LaunchCard";
import { LaunchCardSkeleton } from "@/components/LaunchCardSkeleton";
import { useLaunches } from "@/hooks/useLaunches";
import { formatMarketCap } from "@/lib/utils";

const SUBGRAPH_URL =
  process.env.NEXT_PUBLIC_SUBGRAPH_URL ||
  "https://api.goldsky.com/api/public/project_cmhxop6ixrx0301qpd4oi5bb4/subgraphs/sovry-aeneid/1.1.1/gn";

interface BasicLaunch {
  id: string;
  token: string;
  creator: string;
  createdAt: number;
}

const CATEGORIES = [
  "All",
  "Meme",
  "AI Agent",
  "Gaming",
  "Music",
  "Art",
] as const;

type Category = (typeof CATEGORIES)[number];

// Latest Launches Section Component
function LatestLaunchesSection() {
  const [showGraduated, setShowGraduated] = useState(false)
  const { launches, loading, error, retry } = useLaunches(6)
  
  // Filter launches based on graduated state
  const filteredLaunches = showGraduated
    ? launches.filter((launch) => launch.graduated)
    : launches.filter((launch) => !launch.graduated)

  return (
    <section className="px-4 md:px-6 py-8 sm:py-12" aria-labelledby="latest-launches-heading">
      <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
        {/* Section Header */}
        <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Rocket className="h-5 w-5 sm:h-6 sm:w-6 text-sovry-green" aria-hidden="true" />
              <h2 id="latest-launches-heading" className="text-2xl md:text-3xl font-bold text-zinc-50">Latest Launches</h2>
            </div>
            <p className="text-sm text-zinc-400">
              Discover the latest token launches on the Terminal
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Graduated Filter */}
            <Tabs value={showGraduated ? "graduated" : "active"} onValueChange={(value) => setShowGraduated(value === "graduated")}>
              <TabsList className="bg-zinc-900/50 border border-zinc-800">
                <TabsTrigger value="active" className="data-[state=active]:bg-zinc-800">
                  Active
                </TabsTrigger>
                <TabsTrigger value="graduated" className="data-[state=active]:bg-zinc-800">
                  Graduated
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Link href="/launches">
              <Button
                variant="outline"
                className="flex items-center gap-2 border-zinc-800 hover:border-sovry-green/50 hover:text-sovry-green"
              >
                View All
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </header>

        {/* Launches Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {[...Array(6)].map((_, i) => (
              <LaunchCardSkeleton key={i} />
            ))}
          </div>
        ) : error ? (
          <div className="bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 rounded-xl p-8 text-center space-y-4">
            <p className="text-sm text-zinc-400">
              {error}
            </p>
            <Button
              onClick={retry}
              variant="outline"
              className="border-zinc-800 hover:border-sovry-green/50 hover:text-sovry-green"
            >
              Retry
            </Button>
          </div>
        ) : filteredLaunches.length === 0 ? (
          <div className="bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 rounded-xl p-8 text-center">
            <p className="text-sm text-zinc-400">
              {showGraduated 
                ? "No graduated tokens yet." 
                : "No active launches yet. Be the first to create one!"}
            </p>
          </div>
        ) : (
          <div 
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6"
            role="list"
            aria-label="Latest token launches"
          >
            {filteredLaunches.slice(0, 6).map((launch, index) => {
              // Map launch data to LaunchCard props
              // Note: Using available data structure - imageUrl maps to image, symbol maps to ticker
              // marketCap and bondingProgress are already calculated by enrichLaunchesData
              const image = launch.imageUrl || "/placeholder-ip.png";
              const ticker = launch.symbol || "TOKEN";
              // Format market cap for display
              const marketCap = formatMarketCap(launch.marketCap);
              // Keep raw value for tooltip
              const marketCapRaw = launch.marketCap;
              // bondingProgress is already a percentage (0-100)
              const bondingCurvePercent = launch.bondingProgress || 0;
              const createdBy = launch.creator;

              const tokenAddress = launch.token || launch.id;

              return (
                <div key={tokenAddress} role="listitem">
                  <LaunchCard
                    image={image}
                    ticker={ticker}
                    marketCap={marketCap}
                    marketCapRaw={marketCapRaw}
                    bondingCurvePercent={bondingCurvePercent}
                    createdBy={createdBy}
                    tokenAddress={tokenAddress}
                    className="h-full"
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

async function fetchLaunches(first: number, skip: number): Promise<BasicLaunch[]> {
  try {
    const query = `
      query GetLaunches($first: Int!, $skip: Int!) {
        launches(first: $first, skip: $skip, orderBy: createdAt, orderDirection: desc) {
          id
          token
          creator
          createdAt
        }
      }
    `;

    const res = await fetch(SUBGRAPH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables: { first, skip } }),
    });

    if (!res.ok) return [];

    const json = await res.json();
    const raw = json?.data?.launches || [];

    return raw.map((l: any) => ({
      id: l.id as string,
      token: (l.token as string) || (l.id as string),
      creator: l.creator as string,
      createdAt: Number(l.createdAt || 0),
    }));
  } catch {
    return [];
  }
}

export default function Home() {
  const [basicLaunches, setBasicLaunches] = useState<BasicLaunch[]>([]);
  const [enrichedLaunches, setEnrichedLaunches] = useState<AssetCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [enriching, setEnriching] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<Category>("All");

  // Fetch basic launch data from subgraph
  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const data = await fetchLaunches(24, 0);
        setBasicLaunches(data);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  // Enrich launch data with additional information
  useEffect(() => {
    const enrich = async () => {
      if (basicLaunches.length === 0) {
        setEnrichedLaunches([]);
        return;
      }

      try {
        setEnriching(true);
        const wrapperTokens = basicLaunches.map((l) => l.token || l.id);
        const enrichedData = await enrichLaunchesData(wrapperTokens);

        // Merge basic launch data with enriched data
        const merged: AssetCardData[] = basicLaunches.map((basic) => {
          const token = basic.token || basic.id;
          const enriched = enrichedData.get(token) || {};
          return {
            ...basic,
            ...enriched,
          };
        });

        setEnrichedLaunches(merged);
      } catch (error) {
        console.error("Error enriching launch data:", error);
        // Fallback to basic launches if enrichment fails
        setEnrichedLaunches(
          basicLaunches.map((l) => ({
            ...l,
          }))
        );
      } finally {
        setEnriching(false);
      }
    };

    enrich();
  }, [basicLaunches]);

  // Filter launches by search and category
  const filtered = useMemo(() => {
    let result = enrichedLaunches;

    // Apply category filter
    if (selectedCategory !== "All") {
      result = result.filter((l) => {
        const category = l.category || "IP Asset";
        // Map categories to match our filter categories
        const categoryMap: Record<string, string> = {
          Art: "Art",
          Music: "Music",
          Gaming: "Gaming",
          "AI Agent": "AI Agent",
          Meme: "Meme",
        };
        const mappedCategory = categoryMap[category] || category;
        return mappedCategory === selectedCategory;
      });
    }

    // Apply search filter
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter((l) => {
        const addr = (l.token || "").toLowerCase();
        const creator = (l.creator || "").toLowerCase();
        const symbol = (l.symbol || "").toLowerCase();
        const name = (l.name || "").toLowerCase();
        return (
          addr.includes(q) ||
          creator.includes(q) ||
          symbol.includes(q) ||
          name.includes(q)
        );
      });
    }

    return result;
  }, [enrichedLaunches, search, selectedCategory]);

  const isLoading = loading || enriching;

  return (
    <>
      {/* Floating Top-Right Buttons */}
      <div className="fixed top-4 right-4 z-50 flex items-center gap-3">
        <Link href="/create">
          <Button variant="buy" className="text-sm px-4 py-2">
            <PlusCircle className="h-4 w-4 mr-2" />
            Create
          </Button>
        </Link>
        <div className="bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 rounded-xl">
          <DynamicWidget variant="dropdown" />
        </div>
      </div>

      {/* Hero Section */}
      <ImmersiveHero />

      {/* Latest Launches Section */}
      <LatestLaunchesSection />

      {/* Discovery Section */}
      <div id="discover" className="space-y-6">
        {/* Search and Filters */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <h2 className="text-2xl md:text-3xl font-bold text-zinc-50">Discover Tokens</h2>
            <div className="w-full sm:w-auto sm:max-w-xs">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-zinc-400" />
                <Input
                  placeholder="Search tokens..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10 h-10 bg-zinc-900 border border-zinc-800 rounded-lg"
                />
              </div>
            </div>
          </div>

          {/* Category Pills */}
          <CategoryPills
            selectedCategory={selectedCategory}
            onCategoryChange={setSelectedCategory}
          />
        </div>

        {/* Content Grid */}
        {isLoading ? (
          <div className="bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 rounded-xl p-6">
            <div className="flex items-center gap-3">
              <div className="h-4 w-4 border-2 border-sovry-green border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-zinc-400">
                {loading ? "Loading launches..." : "Enriching launch data..."}
              </span>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 rounded-xl p-6">
            <div className="text-sm text-zinc-400 leading-relaxed">
              {search || selectedCategory !== "All" ? (
                <div>
                  <p className="font-medium mb-1 text-zinc-50">No launches match your filters.</p>
                  <p>Try adjusting your search or category filter.</p>
                </div>
              ) : (
                <div>
                  <p className="font-medium mb-1 text-zinc-50">No launches found yet.</p>
                  <p>Be the first to create one on the Create page.</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <section>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filtered.map((launch) => (
                <AssetCard key={launch.token || launch.id} launch={launch} />
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
