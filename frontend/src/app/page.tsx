"use client";

import { useState, useEffect, useMemo } from "react";
import { Navigation } from "@/components/navigation/Navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import LaunchCard, { type LaunchCardData } from "@/components/launch/LaunchCard";
import { enrichLaunchesData } from "@/services/launchDataService";

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
  "Art",
  "Music",
  "Gaming",
  "Photography",
  "3D Art",
  "Commercial IP",
  "Personal IP",
  "IP Asset",
] as const;

type Category = (typeof CATEGORIES)[number];

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
  const [enrichedLaunches, setEnrichedLaunches] = useState<LaunchCardData[]>([]);
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
        const merged: LaunchCardData[] = basicLaunches.map((basic) => {
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
        return category === selectedCategory;
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
    <div className="min-h-screen bg-background">
      <Navigation />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <header className="mb-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">The Gallery</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Discover IP-backed tokens launched on Sovry Launchpad. Click a launch to trade and view details.
              </p>
            </div>
            <div className="w-full max-w-xs sm:max-w-sm">
              <Input
                placeholder="Search by name, symbol, or creator"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 bg-card/80 border-border/70"
              />
            </div>
          </div>

          {/* Category Filter */}
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((category) => (
              <Button
                key={category}
                variant={selectedCategory === category ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory(category)}
                className="text-xs h-7"
              >
                {category}
              </Button>
            ))}
          </div>
        </header>

        {isLoading ? (
          <div className="border border-border/60 rounded-2xl bg-card/60 p-6">
            <div className="flex items-center gap-3">
              <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-muted-foreground">
                {loading ? "Loading launches..." : "Enriching launch data..."}
              </span>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="border border-border/60 rounded-2xl bg-card/60 p-6 text-sm text-muted-foreground">
            {search || selectedCategory !== "All" ? (
              <div>
                <p className="font-medium mb-1">No launches match your filters.</p>
                <p>Try adjusting your search or category filter.</p>
              </div>
            ) : (
              <div>
                <p className="font-medium mb-1">No launches found yet.</p>
                <p>Be the first to create one on the Create page.</p>
              </div>
            )}
          </div>
        ) : (
          <section>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((launch) => (
                <LaunchCard key={launch.token || launch.id} launch={launch} />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
