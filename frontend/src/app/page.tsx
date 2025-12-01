"use client";

import { useState, useEffect, useMemo } from "react";
import { ImmersiveHero } from "@/components/hero/ImmersiveHero";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DynamicWidget } from "@dynamic-labs/sdk-react-core";
import { Search, Rocket, ArrowRight, PlusCircle } from "lucide-react";
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
  "https://api.goldsky.com/api/public/project_cmhxop6ixrx0301qpd4oi5bb4/subgraphs/Sovry-Aeneid/1.0.0/gn";

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

// Template launches with NFT profile pictures
// Images should be placed in the /public folder with these filenames
function generateTemplateLaunches(): AssetCardData[] {
  const templates = [
    {
      id: "template-1",
      token: "0x1111111111111111111111111111111111111111",
      creator: "0xAAAA1111111111111111111111111111111111",
      createdAt: Math.floor(Date.now() / 1000) - 86400 * 2, // 2 days ago
      symbol: "MEME",
      name: "Dank Meme Token",
      category: "Meme",
      marketCap: "125000",
      bondingProgress: 45,
      imageUrl: "/nft-images/0_1WJiB8mUJKcylomi.jpg",
    },
    {
      id: "template-2",
      token: "0x2222222222222222222222222222222222222222",
      creator: "0xBBBB2222222222222222222222222222222222",
      createdAt: Math.floor(Date.now() / 1000) - 86400 * 5, // 5 days ago
      symbol: "AIAG",
      name: "AI Agent Protocol",
      category: "AI Agent",
      marketCap: "89000",
      bondingProgress: 32,
      imageUrl: "/nft-images/045A39D6-3381-473C-A1F1-FD9AE6408087.png",
    },
    {
      id: "template-3",
      token: "0x3333333333333333333333333333333333333333",
      creator: "0xCCCC3333333333333333333333333333333333",
      createdAt: Math.floor(Date.now() / 1000) - 86400 * 1, // 1 day ago
      symbol: "GAME",
      name: "GameFi Universe",
      category: "Gaming",
      marketCap: "156000",
      bondingProgress: 67,
      imageUrl: "/nft-images/65217fd9e31608b8b6814492_-9ojwcB1tqVmdclia_Sx-oevPA3tjR3E4Y4Qtywk7fp90800zZijuZNz7dsIGPdmsNlpnfq3l1ayZSh1qWraCQqpIuIcNpEuRBg9tW96irdFURf6DDqWgjZ2EKAbqng6wgyhmrxb5fPt20yMRrWwpcg.png",
    },
    {
      id: "template-4",
      token: "0x4444444444444444444444444444444444444444",
      creator: "0xDDDD4444444444444444444444444444444444",
      createdAt: Math.floor(Date.now() / 1000) - 86400 * 3, // 3 days ago
      symbol: "MUSIC",
      name: "Sound Waves NFT",
      category: "Music",
      marketCap: "98000",
      bondingProgress: 28,
      imageUrl: "/nft-images/809E1643-B14A-4377-8A71-A17DB8C014C8.png",
    },
    {
      id: "template-5",
      token: "0x5555555555555555555555555555555555555555",
      creator: "0xEEEE5555555555555555555555555555555555",
      createdAt: Math.floor(Date.now() / 1000) - 86400 * 7, // 7 days ago
      symbol: "ART",
      name: "Digital Canvas",
      category: "Art",
      marketCap: "203000",
      bondingProgress: 78,
      imageUrl: "/nft-images/Creep.png",
    },
    {
      id: "template-6",
      token: "0x6666666666666666666666666666666666666666",
      creator: "0xFFFF6666666666666666666666666666666666",
      createdAt: Math.floor(Date.now() / 1000) - 86400 * 4, // 4 days ago
      symbol: "MEME2",
      name: "Viral Token",
      category: "Meme",
      marketCap: "67000",
      bondingProgress: 21,
      imageUrl: "/nft-images/NFT-creators-money-meme.jpg",
    },
    {
      id: "template-7",
      token: "0x7777777777777777777777777777777777777777",
      creator: "0xAAAA7777777777777777777777777777777777",
      createdAt: Math.floor(Date.now() / 1000) - 86400 * 6, // 6 days ago
      symbol: "AIAG2",
      name: "Neural Network",
      category: "AI Agent",
      marketCap: "142000",
      bondingProgress: 55,
      imageUrl: "/nft-images/84CBC8C0-A37C-4F2F-A051-EBB94EC0B4F7.png",
    },
    {
      id: "template-8",
      token: "0x8888888888888888888888888888888888888888",
      creator: "0xBBBB8888888888888888888888888888888888",
      createdAt: Math.floor(Date.now() / 1000) - 86400 * 2, // 2 days ago
      symbol: "GAME2",
      name: "Metaverse Lands",
      category: "Gaming",
      marketCap: "178000",
      bondingProgress: 62,
      imageUrl: "/nft-images/FIJfBF6WUAINAAk.jpg",
    },
  ];

  return templates;
}

// Latest Launches Section Component
function LatestLaunchesSection() {
  const [showGraduated, setShowGraduated] = useState(false)
  const { launches, loading, error, retry } = useLaunches(6)
  
  // Use template launches when there are no real launches
  const launchesWithTemplates = launches.length === 0 && !loading
    ? generateTemplateLaunches().slice(0, 6).map(t => ({
        ...t,
        graduated: false, // Templates are not graduated
      }))
    : launches
  
  // Filter launches based on graduated state
  const filteredLaunches = showGraduated
    ? launchesWithTemplates.filter((launch) => launch.graduated)
    : launchesWithTemplates.filter((launch) => !launch.graduated)

  return (
    <section className="px-4 md:px-6 py-8 sm:py-12" aria-labelledby="latest-launches-heading">
      <div className="w-full space-y-4 sm:space-y-6">
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
              const createdBy = launch.creator || "0x0000000000000000000000000000000000000000";

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
      query GetWrapperTokens($first: Int!, $skip: Int!) {
        wrapperTokens(first: $first, skip: $skip, orderBy: launchTime, orderDirection: desc) {
          id
          creator
          launchTime
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
    const raw = json?.data?.wrapperTokens || [];

    return raw.map((l: any) => ({
      id: l.id as string,
      token: l.id as string,
      creator: l.creator as string,
      createdAt: Number(l.launchTime || 0),
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
  const { launches: launchesFromHook } = useLaunches(24);

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

  // Compute loading state
  const isLoading = loading || enriching;

  // Add template launches when there are no real launches
  const launchesWithTemplates = useMemo(() => {
    if (enrichedLaunches.length === 0 && !isLoading) {
      return generateTemplateLaunches();
    }
    return enrichedLaunches;
  }, [enrichedLaunches, isLoading]);

  // Filter launches by search and category
  const filtered = useMemo(() => {
    let result = launchesWithTemplates;

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
  }, [launchesWithTemplates, search, selectedCategory]);

  // Use launches from useLaunches hook (same data as Latest Launches) for hero count
  const totalTokens = launchesFromHook.length;

  return (
    <>
      {/* Floating Top-Right Buttons */}
      <div className="fixed top-4 right-4 z-50 flex items-center gap-3">
        <Link href="/create">
          <Button variant="purple" className="text-sm px-4 py-2">
            <PlusCircle className="h-4 w-4 mr-2" />
            Create
          </Button>
        </Link>
        <Button variant="login" className="text-sm px-4 py-2">
          Login
        </Button>
        <div className="bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 rounded-xl">
          <DynamicWidget variant="dropdown" />
        </div>
      </div>

      {/* Hero Section */}
      <ImmersiveHero tokenCount={totalTokens} />

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
