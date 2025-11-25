"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Navigation } from "@/components/navigation/Navigation";
import { Input } from "@/components/ui/input";

interface LaunchCard {
  id: string;
  token: string;
  creator: string;
  createdAt: number;
}

const SUBGRAPH_URL =
  process.env.NEXT_PUBLIC_SUBGRAPH_URL ||
  "https://api.goldsky.com/api/public/project_cmhxop6ixrx0301qpd4oi5bb4/subgraphs/sovry-aeneid/1.1.1/gn";

async function fetchLaunches(first: number, skip: number): Promise<LaunchCard[]> {
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
  const [launches, setLaunches] = useState<LaunchCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchLaunches(24, 0);
        setLaunches(data);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return launches;

    return launches.filter((l) => {
      const addr = (l.token || "").toLowerCase();
      const creator = (l.creator || "").toLowerCase();
      return addr.includes(q) || creator.includes(q);
    });
  }, [launches, search]);

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Sovry Launches</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Discover IP-backed tokens launched on Sovry Launchpad. Click a launch to trade and view details.
            </p>
          </div>
          <div className="w-full max-w-xs sm:max-w-sm">
            <Input
              placeholder="Search by token or creator address"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 bg-card/80 border-border/70"
            />
          </div>
        </header>

        {loading ? (
          <div className="border border-border/60 rounded-2xl bg-card/60 p-6 text-sm text-muted-foreground">
            Loading launches...
          </div>
        ) : filtered.length === 0 ? (
          <div className="border border-border/60 rounded-2xl bg-card/60 p-6 text-sm text-muted-foreground">
            No launches found yet. Be the first to create one on the Create page.
          </div>
        ) : (
          <section>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((launch) => {
                const address = launch.token || launch.id;
                const createdAtDate = launch.createdAt
                  ? new Date(launch.createdAt * 1000)
                  : null;

                return (
                  <Link
                    key={address}
                    href={`/pool/${address}`}
                    className="group rounded-2xl border border-border/60 bg-card/70 hover:border-primary/60 hover:bg-card transition-colors shadow-sm overflow-hidden flex flex-col"
                  >
                    <div className="relative h-32 sm:h-36 bg-gradient-to-br from-indigo-500/40 via-purple-500/30 to-emerald-500/40">
                      <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.35),_transparent_60%)]" />
                      <div className="absolute bottom-3 left-4 flex items-center gap-2">
                        <div className="h-9 w-9 rounded-full bg-background/80 border border-border/60 flex items-center justify-center text-xs font-semibold">
                          {address.slice(2, 4).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-xs font-medium text-foreground truncate max-w-[10rem]">
                            {address.slice(0, 10)}…{address.slice(-4)}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            Wrapper Token
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="p-4 flex-1 flex flex-col gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Creator{" "}
                          <span className="font-mono text-[11px]">
                            {launch.creator.slice(0, 6)}…{launch.creator.slice(-4)}
                          </span>
                        </p>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-1">
                        <span>
                          {createdAtDate
                            ? createdAtDate.toLocaleDateString()
                            : "Recently launched"}
                        </span>
                        <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                          Launchpad
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
