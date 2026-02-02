"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowUpRight, BarChart3, Database, LayoutGrid, Loader2 } from "lucide-react";

import { useDynamicContext } from "@dynamic-labs/sdk-react-core";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { fetchSubgraph } from "@/services/subgraph";
import { truncateAddress } from "@/lib/utils";

type Holder = {
  id: string;
  balance: string;
  wrapper: {
    id: string;
    creator: string;
    ipAsset: string;
    graduated: boolean;
    launchTime: string;
    totalRoyaltiesHarvested: string;
  };
};

type Wrapper = {
  id: string;
  creator: string;
  ipAsset: string;
  graduated: boolean;
  launchTime: string;
  totalRoyaltiesHarvested: string;
};

type RevenueEvent = {
  id: string;
  amount: string;
  timestamp: string;
  token: { id: string };
};

type TabKey = "holdings" | "launches" | "yield";

async function fetchHoldings(user: string): Promise<Holder[]> {
  const query = `
    query Holdings($user: ID!) {
      holders(where: { user: $user, balance_gt: 0 }) {
        id
        balance
        wrapper {
          id
          creator
          ipAsset
          graduated
          launchTime
          totalRoyaltiesHarvested
        }
      }
    }
  `;
  const { ok, json } = await fetchSubgraph(query, { user });
  if (!ok) return [];
  return (json?.data?.holders as Holder[]) || [];
}

async function fetchLaunches(user: string): Promise<Wrapper[]> {
  const query = `
    query MyLaunches($creator: Bytes!) {
      wrapperTokens(where: { creator: $creator }) {
        id
        creator
        ipAsset
        graduated
        launchTime
        totalRoyaltiesHarvested
      }
    }
  `;
  const { ok, json } = await fetchSubgraph(query, { creator: user });
  if (!ok) return [];
  return (json?.data?.wrapperTokens as Wrapper[]) || [];
}

async function fetchRevenueEvents(user: string): Promise<RevenueEvent[]> {
  const query = `
    query RevenueByCreator($creator: Bytes!) {
      wrapperTokens(where: { creator: $creator }) {
        id
        revenueEvents(orderBy: timestamp, orderDirection: desc, first: 25) {
          id
          amount
          timestamp
          token { id }
        }
        totalRoyaltiesHarvested
      }
    }
  `;
  const { ok, json } = await fetchSubgraph(query, { creator: user });
  if (!ok) return [];
  const tokens = (json?.data?.wrapperTokens as any[]) || [];
  return tokens.flatMap((t) => t.revenueEvents as RevenueEvent[]);
}

function formatEth(value: string | number | bigint) {
  const num = typeof value === "string" ? Number(value) : Number(value);
  if (!Number.isFinite(num)) return "0";
  if (num === 0) return "0";
  return num.toLocaleString("en-US");
}

export default function ProfilePage() {
  const { primaryWallet, setShowAuthFlow } = useDynamicContext();
  const address = primaryWallet?.address;

  const [activeTab, setActiveTab] = useState<TabKey>("holdings");
  const [holdings, setHoldings] = useState<Holder[]>([]);
  const [launches, setLaunches] = useState<Wrapper[]>([]);
  const [revenues, setRevenues] = useState<RevenueEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isConnected = !!address;
  const checksum = address?.toLowerCase() || "";

  useEffect(() => {
    const load = async () => {
      if (!checksum) return;
      setLoading(true);
      setError(null);
      try {
        const [h, l, r] = await Promise.all([
          fetchHoldings(checksum),
          fetchLaunches(checksum),
          fetchRevenueEvents(checksum),
        ]);
        setHoldings(h);
        setLaunches(l);
        setRevenues(r);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load profile data");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [checksum]);

  const totalHeld = useMemo(() => holdings.length, [holdings]);
  const totalLaunched = useMemo(() => launches.length, [launches]);
  const totalYield = useMemo(() => revenues.reduce((acc, ev) => acc + Number(ev.amount || 0), 0), [revenues]);

  if (!isConnected) {
    return (
      <section className="px-4 sm:px-6">
        <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center">
          <Card className="w-full max-w-sm border border-[#262626] bg-black">
            <div className="p-6 space-y-4 text-center text-white">
              <div className="mx-auto w-12 h-12 rounded-sm border border-[#262626] bg-black flex items-center justify-center">
                <AlertCircle className="h-5 w-5 text-white/70" />
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-white/60">Access_Locked</p>
                <p className="text-sm">Connect wallet to view profile.</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full h-10 text-[11px] font-mono uppercase tracking-[0.25em] border-[#262626] text-white"
                onClick={() => setShowAuthFlow?.(true)}
              >
                Connect Wallet
              </Button>
            </div>
          </Card>
        </div>
      </section>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <section className="px-4 sm:px-6 py-4 space-y-6">
        <div className="border border-[#262626] bg-black p-4 sm:p-6 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-white/60">Profile</p>
              <p className="text-xl font-semibold">{truncateAddress(address)}</p>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.2em] text-white/70">
              <div className="inline-flex items-center gap-1 border border-[#262626] px-3 py-2">
                <LayoutGrid className="h-4 w-4" /> Hold {totalHeld}
              </div>
              <div className="inline-flex items-center gap-1 border border-[#262626] px-3 py-2">
                <Database className="h-4 w-4" /> Launch {totalLaunched}
              </div>
              <div className="inline-flex items-center gap-1 border border-[#262626] px-3 py-2">
                <BarChart3 className="h-4 w-4" /> Yield {formatEth(totalYield)}
              </div>
            </div>
          </div>

          <div className="flex gap-3 text-[11px] font-mono uppercase tracking-[0.18em] overflow-x-auto">
            {(["holdings", "launches", "yield"] as TabKey[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`pb-2 border-b ${activeTab === tab ? "border-[#CCFF00] text-[#CCFF00]" : "border-transparent text-white/60 hover:text-white"}`}
              >
                {tab === "holdings" ? "[ Holdings ]" : tab === "launches" ? "[ My Launches ]" : "[ Real Yield ]"}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <Card className="border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-100">
            {error}
          </Card>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-white/70">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading profile data...
          </div>
        ) : (
          <>
            {activeTab === "holdings" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {holdings.length === 0 ? (
                  <Card className="border border-dashed border-[#262626] bg-black/40 p-6 text-center text-xs font-mono uppercase tracking-[0.25em] text-white/60">
                    NO_HOLDINGS
                  </Card>
                ) : (
                  holdings.map((h) => (
                    <Card key={h.id} className="border border-[#262626] bg-black/85 p-4 space-y-3">
                      <div className="flex items-center justify-between text-xs font-mono uppercase tracking-[0.2em] text-white/60">
                        <span>Wrapper</span>
                        <Link href={`/pool/${h.wrapper.id}`} className="text-white hover:text-[#CCFF00] inline-flex items-center gap-1">
                          {truncateAddress(h.wrapper.id)} <ArrowUpRight className="h-3 w-3" />
                        </Link>
                      </div>
                      <div className="text-lg font-semibold text-white">Balance: {formatEth(h.balance)}</div>
                      <div className="text-xs text-white/60">Creator: {truncateAddress(h.wrapper.creator)}</div>
                      <div className="text-xs text-white/60">IP: {truncateAddress(h.wrapper.ipAsset)}</div>
                      <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-white/60 flex items-center gap-2">
                        <span className={h.wrapper.graduated ? "text-[#CCFF00]" : "text-white/70"}>
                          {h.wrapper.graduated ? "Graduated" : "Live"}
                        </span>
                        <span className="text-white/50">Harvested: {formatEth(h.wrapper.totalRoyaltiesHarvested)}</span>
                      </div>
                    </Card>
                  ))
                )}
              </div>
            )}

            {activeTab === "launches" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {launches.length === 0 ? (
                  <Card className="border border-dashed border-[#262626] bg-black/40 p-6 text-center text-xs font-mono uppercase tracking-[0.25em] text-white/60">
                    NO_LAUNCHES
                  </Card>
                ) : (
                  launches.map((w) => (
                    <Card key={w.id} className="border border-[#262626] bg-black/85 p-4 space-y-3">
                      <div className="flex items-center justify-between text-xs font-mono uppercase tracking-[0.2em] text-white/60">
                        <span>Wrapper</span>
                        <Link href={`/pool/${w.id}`} className="text-white hover:text-[#CCFF00] inline-flex items-center gap-1">
                          {truncateAddress(w.id)} <ArrowUpRight className="h-3 w-3" />
                        </Link>
                      </div>
                      <div className="text-sm text-white/60">IP: {truncateAddress(w.ipAsset)}</div>
                      <div className="text-xs text-white/60">Launched: {new Date(Number(w.launchTime) * 1000).toLocaleString()}</div>
                      <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-white/60 flex items-center gap-2">
                        <span className={w.graduated ? "text-[#CCFF00]" : "text-white/70"}>
                          {w.graduated ? "Graduated" : "Live"}
                        </span>
                        <span className="text-white/50">Harvested: {formatEth(w.totalRoyaltiesHarvested)}</span>
                      </div>
                    </Card>
                  ))
                )}
              </div>
            )}

            {activeTab === "yield" && (
              <div className="space-y-3">
                <Card className="border border-[#262626] bg-black/85 p-4 flex items-center justify-between text-sm text-white/80">
                  <div className="space-y-1">
                    <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-white/60">Total Yield</p>
                    <p className="text-2xl font-semibold text-white">{formatEth(totalYield)}</p>
                  </div>
                  <Button asChild size="sm" className="text-[11px] font-mono uppercase tracking-[0.2em] bg-[#CCFF00] text-black">
                    <Link href="/create">Launch More</Link>
                  </Button>
                </Card>

                {revenues.length === 0 ? (
                  <Card className="border border-dashed border-[#262626] bg-black/40 p-6 text-center text-xs font-mono uppercase tracking-[0.25em] text-white/60">
                    NO_REVENUE_EVENTS
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {revenues.map((ev) => (
                      <Card key={ev.id} className="border border-[#262626] bg-black/85 p-4 space-y-2">
                        <div className="flex items-center justify-between text-xs font-mono uppercase tracking-[0.2em] text-white/60">
                          <span>Wrapper</span>
                          <Link href={`/pool/${ev.token.id}`} className="text-white hover:text-[#CCFF00] inline-flex items-center gap-1">
                            {truncateAddress(ev.token.id)} <ArrowUpRight className="h-3 w-3" />
                          </Link>
                        </div>
                        <div className="text-lg font-semibold text-white">Amount: {formatEth(ev.amount)}</div>
                        <div className="text-xs text-white/60">Timestamp: {new Date(Number(ev.timestamp) * 1000).toLocaleString()}</div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}