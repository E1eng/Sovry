"use client";

import Image from "next/image";
import { useState, useEffect } from "react";
import { ActionBtn } from "@/components/ui/ActionBtn";
import { GridBackground } from "@/components/ui/GridBackground";
import { TerminalCard } from "@/components/ui/TerminalCard";
import Link from "next/link";
import { PlusCircle, ArrowRight } from "lucide-react";
import { formatEther, formatUnits } from "viem";
import { SOVRY_EXCHANGE_ADDRESS } from "@/services/storyProtocolService";
import { formatMarketCapIP, truncateAddress } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { fetchSubgraph } from "@/services/subgraph";

interface ImmersiveHeroSampleLaunch {
  name?: string;
  symbol?: string;
  marketCap?: string;
  bondingProgress?: number;
  imageUrl?: string;
}

interface ImmersiveHeroProps {
  tokenCount?: number;
  liveCount?: number;
  sampleLaunch?: ImmersiveHeroSampleLaunch;
}

interface HeroTradeTickerItem {
  id: string;
  type: "BUY" | "SELL";
  amount: number;
  pricePerToken: number;
  buyer: string;
  tokenSymbol: string;
}

export function ImmersiveHero({ tokenCount, liveCount, sampleLaunch }: ImmersiveHeroProps) {
  const [totalVolumeIP, setTotalVolumeIP] = useState<number | null>(null);
  const [displayValue, setDisplayValue] = useState(0);
  const [recentTrades, setRecentTrades] = useState<HeroTradeTickerItem[]>([]);

  // Fetch aggregate launchpad stats (total trading volume) from Goldsky subgraph
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const query = `
          query GetLaunchpadStats($id: ID!) {
            launchpad(id: $id) {
              id
              totalVolume
            }
          }
        `;

        const { ok, json } = await fetchSubgraph(query, {
          id: SOVRY_EXCHANGE_ADDRESS.toLowerCase(),
        });

        if (!ok) return;
        const raw = json?.data?.launchpad?.totalVolume as string | null | undefined;
        if (!raw) return;

        const volumeIP = parseFloat(formatEther(BigInt(raw)));
        if (!Number.isFinite(volumeIP)) return;

        setTotalVolumeIP(volumeIP);
      } catch (error) {
        logger.error("Error fetching launchpad stats from subgraph", error);
      }
    };

    fetchStats();
  }, []);

  // Animate the displayed volume when the real value is available
  useEffect(() => {
    if (totalVolumeIP === null || !Number.isFinite(totalVolumeIP)) return;

    const duration = 2000;
    const startTime = Date.now();
    const startValue = 0;
    const targetValue = totalVolumeIP;

    const animate = () => {
      const now = Date.now();
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const currentValue = startValue + (targetValue - startValue) * easeOut;
      setDisplayValue(currentValue);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setDisplayValue(targetValue);
      }
    };

    const timeout = setTimeout(() => {
      requestAnimationFrame(animate);
    }, 300);

    return () => clearTimeout(timeout);
  }, [totalVolumeIP]);

  const formatIPVolume = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatTradeAmount = (value: number) => {
    if (value >= 1_000) return value.toFixed(0);
    if (value >= 1) return value.toFixed(2);
    return value.toFixed(4);
  };

  const shortenAddress = (addr: string | null | undefined) =>
    truncateAddress(addr, { separator: "...", fallback: "" });

  const formatSymbolFallback = (addr: string) =>
    truncateAddress(addr, { start: 6, end: 0, stripPrefix: true, minLength: 6 });

  // Fetch recent trades for hero ticker
  useEffect(() => {
    const fetchRecentTrades = async () => {
      try {
        const query = `
          query GetRecentTrades($first: Int!) {
            trades(first: $first, orderBy: timestamp, orderDirection: desc) {
              id
              type
              amount
              value
              user { id }
              wrapper { id }
            }
          }
        `;

        const { ok, json } = await fetchSubgraph(query, { first: 8 });

        if (!ok) return;
        const raw = (json?.data?.trades || []) as any[];

        if (!Array.isArray(raw) || raw.length === 0) return;

        // Collect wrapper addresses for symbol enrichment
        const wrapperAddrs = Array.from(
          new Set(
            raw
              .map((t: any) => t?.wrapper?.id as string | undefined)
              .filter((x): x is string => typeof x === "string" && x.length > 0)
          )
        );

        const symbolMap = new Map<string, string>();
        if (wrapperAddrs.length > 0) {
          try {
            const { supabase } = await import("@/lib/supabaseClient");
            if (supabase) {
              const candidates = wrapperAddrs.flatMap((a) => [a, a.toLowerCase()]);
              const { data: rows } = await supabase
                .from("tokens")
                .select("token_address, symbol, name")
                .in("token_address", candidates);
              if (Array.isArray(rows)) {
                for (const row of rows) {
                  const r = row as any;
                  const sym = r.symbol || r.name || formatSymbolFallback(r.token_address);
                  symbolMap.set(String(r.token_address).toLowerCase(), sym);
                }
              }
            }
          } catch (e) {
            logger.error("Error fetching symbols for hero trades", e);
          }
        }

        const parsed: HeroTradeTickerItem[] = raw
          .map((t) => {
            try {
              const amountRaw = t?.amount as string | undefined;
              const valueRaw = t?.value as string | undefined;
              const userId = t?.user?.id as string | undefined;
              const wrapperId = (t?.wrapper?.id as string | undefined) || "";
              if (!amountRaw || !valueRaw || !wrapperId) return null;

              const amountBigInt = BigInt(amountRaw);
              const valueBigInt = BigInt(valueRaw);
              if (amountBigInt === 0n) return null;

              const amount = parseFloat(formatUnits(amountBigInt, 6));
              const ipValue = parseFloat(formatEther(valueBigInt));
              if (!Number.isFinite(amount) || !Number.isFinite(ipValue) || amount <= 0) {
                return null;
              }

              const pricePerToken = ipValue / amount;
              const symbolKey = wrapperId.toLowerCase();
              const tokenSymbol =
                symbolMap.get(symbolKey) || formatSymbolFallback(symbolKey).toUpperCase();

              return {
                id: String(t.id),
                type: String(t.type) === "SELL" ? "SELL" : "BUY",
                amount,
                pricePerToken,
                buyer: userId ? shortenAddress(userId) : "",
                tokenSymbol,
              } as HeroTradeTickerItem;
            } catch {
              return null;
            }
          })
          .filter((x): x is HeroTradeTickerItem => x !== null)
          .slice(0, 8);

        if (parsed.length > 0) {
          setRecentTrades(parsed);
        }
      } catch (error) {
        logger.error("Error fetching recent trades for hero ticker", error);
      }
    };

    fetchRecentTrades();
  }, []);

  const sampleReady = Boolean(
    sampleLaunch?.name &&
      sampleLaunch?.marketCap &&
      typeof sampleLaunch?.bondingProgress === "number"
  );

  const sampleName = sampleLaunch?.name || "";
  const sampleSymbol = sampleLaunch?.symbol || "";
  const sampleMarketCap = sampleLaunch?.marketCap ? formatMarketCapIP(sampleLaunch.marketCap) : "—";
  const sampleBonding = typeof sampleLaunch?.bondingProgress === "number" ? sampleLaunch.bondingProgress : 0;
  const sampleImageUrl = sampleLaunch?.imageUrl;

  return (
    <section className="px-3 sm:px-4 md:px-6 pt-4 pb-6 sm:pt-6 sm:pb-8">
      <GridBackground columns={8} className="border border-border bg-card">
        <div className="relative px-4 py-5 sm:px-8 sm:py-8 lg:px-10 lg:py-10">
          <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:items-start">
            {/* Left: Text content */}
            <div className="min-w-0 space-y-5 sm:space-y-6">
              <div className="inline-flex items-center gap-2 border border-border bg-muted px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                <span className="h-2 w-2 bg-primary" />
                <span>
                  {typeof tokenCount === "number"
                    ? `${tokenCount.toLocaleString("en-US")} tokens launched on Sovry`
                    : "Launch IP-backed tokens on Sovry"}
                </span>
              </div>

              <div className="space-y-3">
                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-foreground">
                  Launch IP-backed tokens on Sovry.
                </h1>
                <p className="max-w-xl text-sm sm:text-base text-muted-foreground">
                  Register your IP, launch a bonding curve token, and let the market discover it.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <ActionBtn tone="primary" asChild className="text-[11px]">
                  <Link href="/create">
                    <PlusCircle className="h-4 w-4" strokeWidth={1.5} />
                    Create IP
                  </Link>
                </ActionBtn>
                <ActionBtn tone="ghost" asChild className="text-[11px]">
                  <Link href="#explore">
                    Explore tokens
                    <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </Link>
                </ActionBtn>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <TerminalCard className="p-3">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    Total trading volume (IP)
                  </div>
                  <div className="mt-2 text-lg font-mono text-foreground">
                    {totalVolumeIP !== null ? `${formatIPVolume(displayValue)} IP` : "—"}
                  </div>
                </TerminalCard>
                <TerminalCard className="p-3">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    Live bonding curves
                  </div>
                  <div className="mt-2 text-lg font-mono text-primary">
                    {typeof liveCount === "number"
                      ? liveCount
                      : typeof tokenCount === "number"
                        ? Math.max(1, Math.floor(tokenCount / 3))
                        : 42}
                  </div>
                </TerminalCard>
              </div>
            </div>

            {/* Right: Preview card */}
            <TerminalCard className="p-4 flex flex-col gap-4">
              {sampleReady ? (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-10 w-10 border border-border bg-muted flex items-center justify-center overflow-hidden">
                        {sampleImageUrl ? (
                          <Image
                            src={sampleImageUrl}
                            alt={sampleName}
                            width={40}
                            height={40}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="text-lg font-semibold text-muted-foreground">
                            {sampleName.charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{sampleName}</p>
                        <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-mono">
                          {sampleSymbol}
                        </p>
                      </div>
                    </div>
                    <span className="inline-flex items-center border border-border px-2 py-1 text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                      MC {sampleMarketCap}
                    </span>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <div className="h-6 w-6 flex-shrink-0">
                          <Image
                            src="/ip-badge-2.svg"
                            alt="IP badge"
                            width={24}
                            height={24}
                            className="h-full w-full object-contain"
                          />
                        </div>
                        <span className="truncate">Backed by on-chain IP registration</span>
                      </div>

                      <div className="border border-border bg-muted px-3 py-2">
                        <div className="flex animate-infinite-cards gap-2">
                          {Array.from({ length: 2 }).map((_, outerIndex) => (
                            <div key={outerIndex} className="flex gap-2">
                              {(recentTrades.length > 0 ? recentTrades : []).map((trade, index) => (
                                <div
                                  key={`${trade.id}-${outerIndex}-${index}`}
                                  className="flex items-center gap-2 border border-border bg-card px-3 py-1 text-[10px] text-foreground font-mono"
                                >
                                  <span
                                    className={
                                      trade.type === "BUY"
                                        ? "h-1.5 w-1.5 bg-primary"
                                        : "h-1.5 w-1.5 bg-secondary"
                                    }
                                  />
                                  <span className="whitespace-nowrap">
                                    {`${trade.type} ${formatTradeAmount(trade.amount)} ${trade.tokenSymbol}`}
                                  </span>
                                </div>
                              ))}
                              {recentTrades.length === 0 && (
                                <div className="flex gap-2">
                                  {Array.from({ length: 3 }).map((__, sk) => (
                                    <div
                                      key={`${outerIndex}-sk-${sk}`}
                                      className="h-6 w-28 border border-border bg-card animate-pulse"
                                    />
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span>Bonding progress</span>
                        <span className="font-mono text-foreground">{sampleBonding.toFixed(1)}%</span>
                      </div>
                      <div className="h-1 w-full bg-muted">
                        <div
                          className="h-full bg-primary"
                          style={{ width: `${Math.max(0, Math.min(100, sampleBonding))}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-10 w-10 border border-border bg-muted animate-pulse" />
                      <div className="min-w-0 space-y-2">
                        <div className="h-3 w-36 bg-muted animate-pulse" />
                        <div className="h-2.5 w-16 bg-muted animate-pulse" />
                      </div>
                    </div>
                    <div className="h-5 w-20 border border-border bg-muted animate-pulse" />
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 bg-muted animate-pulse" />
                      <div className="h-3 w-48 bg-muted animate-pulse" />
                    </div>

                    <div className="border border-border bg-muted px-3 py-2">
                      <div className="flex gap-2">
                        {Array.from({ length: 3 }).map((_, i) => (
                          <div
                            key={`hero-trade-skel-${i}`}
                            className="h-6 w-28 border border-border bg-card animate-pulse"
                          />
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="h-3 w-24 bg-muted animate-pulse" />
                        <div className="h-3 w-12 bg-muted animate-pulse" />
                      </div>
                      <div className="h-1 w-full bg-muted">
                        <div className="h-full w-1/3 bg-border" />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </TerminalCard>
          </div>
        </div>
      </GridBackground>
    </section>
  );
}

