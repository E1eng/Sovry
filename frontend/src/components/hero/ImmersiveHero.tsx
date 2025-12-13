"use client";

import Image from "next/image";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { PlusCircle, ArrowRight } from "lucide-react";
import { formatEther, formatUnits } from "viem";
import { formatMarketCap, enrichLaunchData } from "@/services/launchDataService";
import { SOVRY_LAUNCHPAD_ADDRESS } from "@/services/storyProtocolService";

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

const SUBGRAPH_URL_RAW = process.env.NEXT_PUBLIC_SUBGRAPH_URL;
if (!SUBGRAPH_URL_RAW) {
  throw new Error('NEXT_PUBLIC_SUBGRAPH_URL is required but not set in environment variables');
}
const SUBGRAPH_URL: string = SUBGRAPH_URL_RAW;

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
      if (!SUBGRAPH_URL) return;

      try {
        const query = `
          query GetLaunchpadStats($id: ID!) {
            launchpad(id: $id) {
              id
              totalVolume
            }
          }
        `;

        const res = await fetch(SUBGRAPH_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query,
            variables: { id: SOVRY_LAUNCHPAD_ADDRESS.toLowerCase() },
          }),
        });

        if (!res.ok) return;

        const json = await res.json();
        const raw = json?.data?.launchpad?.totalVolume as string | null | undefined;
        if (!raw) return;

        const volumeIP = parseFloat(formatEther(BigInt(raw)));
        if (!Number.isFinite(volumeIP)) return;

        setTotalVolumeIP(volumeIP);
      } catch (error) {
        console.error("Error fetching launchpad stats from subgraph", error);
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

  const formatTradePrice = (value: number) => {
    if (value >= 1) return value.toFixed(3);
    if (value >= 0.01) return value.toFixed(4);
    return value.toFixed(6);
  };

  const shortenAddress = (addr: string | null | undefined) => {
    if (!addr || addr.length < 10) return addr || "";
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  // Fetch recent trades for hero ticker
  useEffect(() => {
    const fetchRecentTrades = async () => {
      if (!SUBGRAPH_URL) return;

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

        const res = await fetch(SUBGRAPH_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, variables: { first: 8 } }),
        });

        if (!res.ok) return;

        const json = await res.json();
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
            const results = await Promise.all(
              wrapperAddrs.map(async (addr) => {
                try {
                  const data = await enrichLaunchData(addr);
                  const sym = (data.symbol || data.name || addr.slice(0, 6)).toString();
                  return [addr, sym] as [string, string];
                } catch {
                  return [addr, addr.slice(0, 6)] as [string, string];
                }
              })
            );
            for (const [addr, sym] of results) {
              symbolMap.set(addr.toLowerCase(), sym);
            }
          } catch (e) {
            console.error("Error enriching symbols for hero trades", e);
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
              const tokenSymbol = symbolMap.get(symbolKey) || symbolKey.slice(0, 6).toUpperCase();

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
        console.error("Error fetching recent trades for hero ticker", error);
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
  const sampleMarketCap = sampleLaunch?.marketCap ? formatMarketCap(sampleLaunch.marketCap) : "—";
  const sampleBonding = typeof sampleLaunch?.bondingProgress === "number" ? sampleLaunch.bondingProgress : 0;
  const sampleImageUrl = sampleLaunch?.imageUrl;

  return (
    <section className="px-3 sm:px-4 md:px-6 pt-4 pb-6 sm:pt-6 sm:pb-8">
      <div className="relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 px-4 py-5 sm:px-8 sm:py-8 lg:px-10 lg:py-10">
        {/* Decorative glows */}
        <div className="pointer-events-none absolute -left-20 top-0 h-56 w-56 rounded-full bg-sovry-green/15 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-64 w-64 rounded-full bg-sovry-pink/10 blur-3xl" />

        <div className="relative flex flex-col lg:flex-row items-start gap-6 lg:gap-10">
          {/* Left: Text content */}
          <div className="flex-1 min-w-0 space-y-5 sm:space-y-6">
            {/* Stats Badge */}
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-zinc-700/70 bg-zinc-900/70 px-3 py-1 text-xs text-zinc-400 backdrop-blur">
                <span className="h-1.5 w-1.5 rounded-full bg-sovry-green animate-pulse" />
                <span>
                  {typeof tokenCount === "number"
                    ? `${tokenCount.toLocaleString("en-US")} tokens launched on Sovry`
                    : "Launch IP-backed tokens on Sovry"}
                </span>
              </div>
            </div>

            {/* Main Headline */}
            <div className="space-y-3">
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-zinc-50">
                Launch IP-backed tokens on Sovry.
              </h1>
              <p className="max-w-xl text-sm sm:text-base text-zinc-400">
                Register your IP, launch a bonding curve token, and let the market discover it.
              </p>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-wrap items-center gap-4">
              <Link href="/create">
                <Button variant="buy" className="gap-2 px-5 py-2.5 text-sm font-medium">
                  <PlusCircle className="h-4 w-4" />
                  Create IP
                </Button>
              </Link>
              <Link
                href="#explore"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-200 hover:text-sovry-green transition-colors"
              >
                Explore tokens
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            {/* Stats Row */}
            <div className="flex gap-3 pt-2 text-xs sm:text-sm">
              <div className="flex-1 rounded-xl border border-zinc-800/80 bg-zinc-950/70 px-3 py-2 sm:px-4 sm:py-3">
                <div className="text-[11px] sm:text-xs text-zinc-400">Total trading volume (IP)</div>
                <div className="text-sm sm:text-lg font-semibold text-zinc-50">
                  {totalVolumeIP !== null ? `${formatIPVolume(displayValue)} IP` : "—"}
                </div>
              </div>
              <div className="flex-1 rounded-xl border border-zinc-800/80 bg-zinc-950/70 px-3 py-2 sm:px-4 sm:py-3">
                <div className="text-[11px] sm:text-xs text-zinc-400">Live bonding curves</div>
                <div className="text-sm sm:text-lg font-semibold text-sovry-green">
                  {typeof liveCount === "number"
                    ? liveCount
                    : typeof tokenCount === "number"
                      ? Math.max(1, Math.floor(tokenCount / 3))
                      : 42}
                </div>
              </div>
            </div>
          </div>

          {/* Right: Preview card */}
          <div className="w-full max-w-sm lg:max-w-md flex-shrink-0">
            <div className="relative overflow-hidden rounded-xl border border-zinc-800/80 bg-gradient-to-br from-zinc-900 via-zinc-950 to-zinc-900 p-4 flex flex-col gap-4">
              {sampleReady ? (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-zinc-800/80 flex items-center justify-center overflow-hidden">
                        {sampleImageUrl ? (
                          <Image
                            src={sampleImageUrl}
                            alt={sampleName}
                            width={40}
                            height={40}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="text-lg font-bold text-zinc-300">
                            {sampleName.charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-zinc-50 truncate">{sampleName}</p>
                        <p className="text-xs text-zinc-500">{sampleSymbol}</p>
                      </div>
                    </div>
                    <span className="inline-flex items-center rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-300 whitespace-nowrap">
                      MC {sampleMarketCap}
                    </span>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-zinc-400">
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

                      <div className="relative mt-1 overflow-hidden rounded-md border border-zinc-800/80 bg-zinc-900/40">
                        <div className="flex animate-infinite-cards gap-2 px-3 py-2">
                          {Array.from({ length: 2 }).map((_, outerIndex) => (
                            <div key={outerIndex} className="flex gap-2">
                              {(recentTrades.length > 0 ? recentTrades : []).map((trade, index) => (
                                <div
                                  key={`${trade.id}-${outerIndex}-${index}`}
                                  className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-950/80 px-3 py-1 text-[11px] text-zinc-300 shadow-sm"
                                >
                                  <span
                                    className={
                                      trade.type === "BUY"
                                        ? "h-1.5 w-1.5 rounded-full bg-emerald-400"
                                        : "h-1.5 w-1.5 rounded-full bg-red-400"
                                    }
                                  />
                                  <span className="whitespace-nowrap">
                                    {`${trade.type} - ${formatTradeAmount(trade.amount)} ${trade.tokenSymbol}`}
                                  </span>
                                </div>
                              ))}
                              {recentTrades.length === 0 && (
                                <div className="flex gap-2">
                                  {Array.from({ length: 3 }).map((__, sk) => (
                                    <div
                                      key={`${outerIndex}-sk-${sk}`}
                                      className="relative h-6 w-28 overflow-hidden rounded-md border border-zinc-800 bg-zinc-950/80"
                                    >
                                      <div className="absolute inset-0 bg-gradient-to-r from-zinc-800 via-zinc-700/50 to-zinc-800 bg-[length:200%_100%] animate-shimmer" />
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-zinc-400">
                        <span>Bonding progress</span>
                        <span className="font-semibold text-zinc-50">{sampleBonding.toFixed(1)}%</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-zinc-800/80 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-sovry-green"
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
                      <div className="relative h-10 w-10 overflow-hidden rounded-lg bg-zinc-800/80">
                        <div className="absolute inset-0 bg-gradient-to-r from-zinc-800 via-zinc-700/50 to-zinc-800 bg-[length:200%_100%] animate-shimmer" />
                      </div>
                      <div className="min-w-0 space-y-2">
                        <div className="relative h-3 w-36 overflow-hidden rounded bg-zinc-800">
                          <div className="absolute inset-0 bg-gradient-to-r from-zinc-800 via-zinc-700/50 to-zinc-800 bg-[length:200%_100%] animate-shimmer" />
                        </div>
                        <div className="relative h-2.5 w-16 overflow-hidden rounded bg-zinc-900">
                          <div className="absolute inset-0 bg-gradient-to-r from-zinc-800 via-zinc-700/50 to-zinc-800 bg-[length:200%_100%] animate-shimmer" />
                        </div>
                      </div>
                    </div>
                    <div className="relative h-5 w-20 overflow-hidden rounded-lg border border-zinc-800 bg-emerald-500/10">
                      <div className="absolute inset-0 bg-gradient-to-r from-zinc-800 via-zinc-700/40 to-zinc-800 bg-[length:200%_100%] animate-shimmer" />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="relative h-6 w-6 overflow-hidden rounded bg-zinc-800/80">
                        <div className="absolute inset-0 bg-gradient-to-r from-zinc-800 via-zinc-700/50 to-zinc-800 bg-[length:200%_100%] animate-shimmer" />
                      </div>
                      <div className="relative h-3 w-48 overflow-hidden rounded bg-zinc-800">
                        <div className="absolute inset-0 bg-gradient-to-r from-zinc-800 via-zinc-700/50 to-zinc-800 bg-[length:200%_100%] animate-shimmer" />
                      </div>
                    </div>

                    <div className="relative overflow-hidden rounded-md border border-zinc-800/80 bg-zinc-900/40 px-3 py-2">
                      <div className="flex gap-2">
                        {Array.from({ length: 3 }).map((_, i) => (
                          <div
                            key={`hero-trade-skel-${i}`}
                            className="relative h-6 w-28 overflow-hidden rounded-md border border-zinc-800 bg-zinc-950/80"
                          >
                            <div className="absolute inset-0 bg-gradient-to-r from-zinc-800 via-zinc-700/50 to-zinc-800 bg-[length:200%_100%] animate-shimmer" />
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="relative h-3 w-24 overflow-hidden rounded bg-zinc-800">
                          <div className="absolute inset-0 bg-gradient-to-r from-zinc-800 via-zinc-700/50 to-zinc-800 bg-[length:200%_100%] animate-shimmer" />
                        </div>
                        <div className="relative h-3 w-12 overflow-hidden rounded bg-zinc-800">
                          <div className="absolute inset-0 bg-gradient-to-r from-zinc-800 via-zinc-700/50 to-zinc-800 bg-[length:200%_100%] animate-shimmer" />
                        </div>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-zinc-800/80 overflow-hidden">
                        <div className="h-full w-1/3 rounded-full bg-zinc-700/60" />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

