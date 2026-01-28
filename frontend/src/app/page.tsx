"use client";

import { useMemo } from "react";
import Image from "next/image";
import Link from "next/link";

import { useLaunches } from "@/hooks/useLaunches";
import { formatMarketCapIP, truncateAddress } from "@/lib/utils";

type LaunchRow = {
  id: string;
  symbol: string;
  name: string;
  marketCap: number;
  bondingProgress: number;
  creator: string;
  imageUrl?: string | null;
  graduated?: boolean;
  tokenAddress: string;
};

const marqueeStats = [
  "ETH: $2,400",
  "GAS: 12 GWEI",
  "SOVRY_BOND_VOL: $4.2M",
  "NEW_MINT: #4021",
  "ROYALTY_INJECTION LIVE",
  "STORY L1 ONLINE",
];

const getSeededNumber = (seed: string, min: number, max: number) => {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const normalized = hash / 2 ** 32;
  return Math.round(min + (max - min) * normalized);
};

const getVolume = (launch: LaunchRow) => Math.max(Number(launch.marketCap) || 0, 0);

export default function Home() {
  const { launches, loading, error, retry } = useLaunches(24);

  const spotlight = launches[0];
  const marketMovers = launches.slice(0, 5);
  const terminalRows: LaunchRow[] = launches.slice(0, 12).map((launch) => ({
    id: launch.id,
    symbol: (launch.symbol || launch.name || "TOKEN").toString().slice(0, 8).toUpperCase(),
    name: launch.name || "Untitled IP",
    marketCap: Number(launch.marketCap) || 0,
    bondingProgress: Number(launch.bondingProgress) || 0,
    creator: launch.creator || "0x0",
    imageUrl: launch.imageUrl,
    graduated: launch.graduated,
    tokenAddress: launch.token || launch.id,
  }));

  const maxVolume = useMemo(() => {
    if (terminalRows.length === 0) return 1;
    return Math.max(...terminalRows.map(getVolume), 1);
  }, [terminalRows]);

  const priceLabel = (row: LaunchRow) => {
    const syntheticPrice = row.marketCap > 0 ? row.marketCap / 1_000_000 : row.bondingProgress / 10;
    return `$${syntheticPrice.toFixed(2)}`;
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top neon ticker */}
      <div className="h-8 w-full bg-[#CCFF00] text-black border-b border-black/40 overflow-hidden">
        <div className="h-full flex items-center font-mono text-[10px] sm:text-xs uppercase tracking-[0.25em]">
          <div className="animate-[marquee_22s_linear_infinite] whitespace-nowrap flex items-center gap-8">
            {marqueeStats.concat(marqueeStats).map((item, idx) => (
              <span key={`${item}-${idx}`} className="flex items-center gap-2">
                <span className="h-1 w-1 rounded-full bg-black" />
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Hero: asymmetric split */}
      <section className="px-4 sm:px-6 py-6">
        <div className="mt-4 border border-[#262626] bg-[#050505] rounded-xl overflow-hidden shadow-[0_20px_60px_-30px_rgba(0,0,0,0.8)]">
          <div className="relative min-h-[70vh] sm:min-h-[70vh] md:min-h-[65vh] lg:min-h-[500px] grid grid-cols-12">
          <div className="col-span-12 lg:col-span-8 relative border-b lg:border-b-0 lg:border-r border-[#262626] overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-black via-black/40 to-transparent" />
            {spotlight?.imageUrl ? (
              <Image
                src={spotlight.imageUrl}
                alt={spotlight.name || "Spotlight"}
                fill
                unoptimized
                className="object-cover scale-[1.02]"
              />
            ) : (
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,#0f0f0f,transparent_45%),radial-gradient(circle_at_80%_30%,#111,transparent_40%),#000]" />
            )}
            <div className="absolute inset-0 flex flex-col gap-5 sm:gap-7 p-6 sm:p-6 md:p-8 lg:p-8 pt-18 pb-24 sm:pt-18 sm:pb-16 lg:pt-12 lg:pb-10">
              <div className="space-y-2 md:space-y-3">
                <span className="inline-flex items-center gap-2 rounded-sm bg-white/15 px-3.5 py-1.5 text-[11px] font-mono uppercase tracking-[0.28em] text-[#CCFF00] border border-[#262626]">
                  IP_OF_THE_DAY
                </span>
                <h1 className="text-2xl sm:text-3xl md:text-5xl font-black tracking-tight text-white drop-shadow-[0_10px_30px_rgba(0,0,0,0.6)]">
                  {spotlight?.name || "Signal Lost"}
                </h1>
                <p className="text-[12px] sm:text-[13px] md:text-base text-white/70 max-w-2xl">
                  Spotlighted IP asset sourced from Story Protocol. Tap into the bonding curve and the royalty vault in one launch flow.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-[11px] md:text-xs font-mono uppercase tracking-[0.2em] text-white/70">
                <span className="rounded-sm border border-white/10 bg-black/40 px-3 py-1">
                  {spotlight ? formatMarketCapIP(spotlight.marketCap) : "--"}
                </span>
                <span className="rounded-sm border border-white/10 bg-black/40 px-3 py-1">
                  {spotlight ? `Progress ${Math.round(spotlight.bondingProgress || 0)}%` : "Awaiting signal"}
                </span>
                <Link
                  href={spotlight ? `/pool/${spotlight.token || spotlight.id}` : "#"}
                  className="rounded-sm border border-[#CCFF00] bg-[#CCFF00] text-black px-4 py-2 text-[10px] md:text-[11px] font-mono uppercase tracking-[0.25em] hover:brightness-110 transition"
                >
                  View Asset
                </Link>
              </div>
            </div>
          </div>

          {/* Rising Board */}
          <div className="col-span-12 lg:col-span-4 bg-[#0A0A0A] border-t lg:border-t-0 lg:border-l border-[#262626] flex flex-col">
            <div className="border-b border-[#262626] px-4 py-3 flex items-center justify-between">
              <p className="text-[11px] font-mono uppercase tracking-[0.3em] text-muted-foreground">Market Movers</p>
              {error && (
                <button onClick={retry} className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#CCFF00]">
                  Retry
                </button>
              )}
            </div>
            <div className="flex-1 divide-y divide-[#1a1a1a]">
              {(loading ? Array.from({ length: 5 }) : marketMovers).map((item, idx) => {
                const key = loading ? `skeleton-${idx}` : item.token || item.id;
                const gain = loading ? 0 : getSeededNumber(String(item.id), 12, 480);
                return (
                  <Link
                    key={key}
                    href={loading ? "#" : `/pool/${item.token || item.id}`}
                    className="flex items-center gap-3 px-4 py-3 group hover:bg-white/5 transition-colors"
                  >
                    <div className="w-12 h-12 rounded-sm overflow-hidden border border-[#262626] bg-black/60 relative">
                      {!loading && item.imageUrl ? (
                        <Image src={item.imageUrl} alt={item.name || "IP"} fill unoptimized className="object-cover" />
                      ) : (
                        <div className="absolute inset-0 bg-[#111]" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-foreground truncate">
                        {loading ? "Booting..." : item.name || "Untitled IP"}
                      </div>
                      <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                        Bonding volume
                      </div>
                    </div>
                    <div className="flex flex-col items-end text-right">
                      <span className="text-[13px] font-semibold text-[#CCFF00] font-mono">+{gain}%</span>
                      <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                        {loading ? "--" : formatMarketCapIP(item.marketCap)}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      </section>

      {/* Market Board */}
      <section className="px-4 sm:px-6 py-8 lg:py-10 bg-[#050505]">
        <div className="border border-[#262626] bg-[#0A0A0A] shadow-[0_20px_60px_-30px_rgba(0,0,0,0.8)]">
          <div className="flex items-center justify-between px-4 lg:px-6 py-4 border-b border-[#262626]">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-2 w-2 rounded-full bg-[#CCFF00] shadow-[0_0_0_4px_rgba(204,255,0,0.15)]" />
              <h2 className="text-sm font-semibold tracking-[0.25em] uppercase text-muted-foreground">Market Board</h2>
            </div>
            {error && (
              <button onClick={retry} className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#CCFF00]">
                Retry
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">
                <tr className="border-b border-[#262626] bg-[#0d0d0d]">
                  <th className="px-4 py-3 text-left border-r border-[#1a1a1a]">Asset</th>
                  <th className="px-4 py-3 text-left border-r border-[#1a1a1a]">Price</th>
                  <th className="px-4 py-3 text-left border-r border-[#1a1a1a]">Volume</th>
                  <th className="px-4 py-3 text-left border-r border-[#1a1a1a]">Progress</th>
                  <th className="px-4 py-3 text-left">Creator</th>
                </tr>
              </thead>
              <tbody className="text-[12px] font-mono text-foreground">
                {loading
                  ? Array.from({ length: 6 }).map((_, idx) => (
                      <tr key={idx} className="border-b border-[#262626]">
                        <td className="px-4 py-3">
                          <div className="h-3 w-24 bg-[#1a1a1a]" />
                        </td>
                        <td className="px-4 py-3">
                          <div className="h-3 w-16 bg-[#1a1a1a]" />
                        </td>
                        <td className="px-4 py-3">
                          <div className="h-3 w-28 bg-[#1a1a1a]" />
                        </td>
                        <td className="px-4 py-3">
                          <div className="h-3 w-20 bg-[#1a1a1a]" />
                        </td>
                        <td className="px-4 py-3">
                          <div className="h-3 w-24 bg-[#1a1a1a]" />
                        </td>
                      </tr>
                    ))
                  : terminalRows.length === 0
                    ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-6 text-center text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                            No data available
                          </td>
                        </tr>
                      )
                    : terminalRows.map((row) => {
                        const gain = getSeededNumber(row.id, -12, 420);
                        const isUp = gain >= 0;
                        const volume = getVolume(row);
                        const volumePct = Math.min(100, Math.max(5, Math.round((volume / maxVolume) * 100)));
                        const creatorLabel = truncateAddress(row.creator, { start: 6, end: 4, separator: "…", minLength: 10 });
                        return (
                          <tr
                            key={row.id}
                            className="border-b border-[#1a1a1a] hover:bg-white/5 transition-colors group"
                          >
                            <td className="px-4 py-3 border-r border-[#1a1a1a]">
                              <div className="flex items-center gap-3">
                                <div className="relative h-10 w-10 rounded-sm overflow-hidden border border-[#262626] bg-black/60">
                                  {row.imageUrl ? (
                                    <Image src={row.imageUrl} alt={row.name} fill unoptimized className="object-cover" />
                                  ) : (
                                    <div className="absolute inset-0 bg-[#0d0d0d]" />
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <Link href={`/pool/${row.tokenAddress}`} className="text-sm font-semibold hover:text-[#CCFF00] transition-colors">
                                    {row.name}
                                  </Link>
                                  <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{row.symbol}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 border-r border-[#1a1a1a]">
                              <span
                                className={`inline-flex items-center gap-2 rounded-sm px-2 py-1 ${
                                  isUp ? "bg-emerald-900/40 text-emerald-200" : "bg-red-900/40 text-red-200"
                                } animate-pulse`}
                              >
                                <span className="text-[10px] opacity-70">{isUp ? "▲" : "▼"}</span>
                                {priceLabel(row)}
                              </span>
                            </td>
                            <td className="px-4 py-3 border-r border-[#1a1a1a]">
                              <div className="flex items-center gap-3">
                                <div className="relative h-2 w-32 bg-[#0f0f0f] rounded-sm overflow-hidden">
                                  <div
                                    className="absolute inset-y-0 left-0 bg-[#CCFF00]/80"
                                    style={{ width: `${volumePct}%` }}
                                  />
                                </div>
                                <span className="text-[11px] tabular-nums text-muted-foreground">{formatMarketCapIP(volume)}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 border-r border-[#1a1a1a] tabular-nums">
                              <div className="flex items-center gap-2">
                                <span>{Math.round(row.bondingProgress)}%</span>
                                <div className="h-1 w-16 bg-[#0f0f0f] rounded-sm overflow-hidden">
                                  <div className="h-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, row.bondingProgress))}%` }} />
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 tabular-nums">
                              <div className="flex items-center gap-2 border-l-4 border-transparent group-hover:border-[#CCFF00] pl-2">
                                <span className="text-[11px] text-muted-foreground">{creatorLabel}</span>
                                {row.graduated && (
                                  <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#CCFF00]">Graduated</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <style jsx>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
