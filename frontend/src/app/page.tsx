"use client";

import { useCallback, useState } from "react";
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
  currentPrice: number;
  volume24h: number;
  dailyChangePct: number | null;
  creator: string;
  imageUrl?: string | null;
  graduated?: boolean;
  tokenAddress: string;
};

const getVolume = (launch: LaunchRow) => Math.max(Number(launch.volume24h) || 0, 0);

export default function Home() {
  const { launches, loading, error, retry } = useLaunches(24);

  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});

  const markImageError = useCallback((key: string) => {
    setImageErrors((prev) => {
      if (prev[key]) return prev;
      return { ...prev, [key]: true };
    });
  }, []);

  const spotlight = launches[0];
  const withChange = launches
    .filter((item) => typeof item.dailyChangePct === "number" && isFinite(item.dailyChangePct));
  withChange.sort((a, b) => Math.abs((b.dailyChangePct as number)) - Math.abs((a.dailyChangePct as number)));
  const marketMovers = withChange.length > 0 ? withChange.slice(0, 5) : launches.slice(0, 5);
  const terminalRows: LaunchRow[] = launches.slice(0, 12).map((launch) => ({
    id: launch.id,
    symbol: (launch.symbol || launch.name || "TOKEN").toString().slice(0, 8).toUpperCase(),
    name: launch.name || "Untitled IP",
    marketCap: Number(launch.marketCap) || 0,
    bondingProgress: Number(launch.bondingProgress) || 0,
    currentPrice: Number(launch.currentPrice) || 0,
    volume24h: Number(launch.volume24h) || 0,
    dailyChangePct: launch.dailyChangePct ?? null,
    creator: launch.creator || "0x0",
    imageUrl: launch.imageUrl,
    graduated: launch.graduated,
    tokenAddress: launch.token || launch.id,
  }));

  const maxVolume = terminalRows.length === 0 ? 1 : Math.max(...terminalRows.map(getVolume), 1);

  const priceLabel = (row: LaunchRow) => {
    if (row.currentPrice > 0) return `${row.currentPrice.toFixed(6)} IP`;
    return "—";
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Hero: asymmetric split */}
      <section className="px-4 sm:px-6 py-6">
        <div className="mt-4 border border-[#262626] bg-[#050505] rounded-xl overflow-hidden shadow-[0_20px_60px_-30px_rgba(0,0,0,0.8)]">
          <div className="relative grid grid-cols-12">
          <div className="col-span-12 lg:col-span-8 relative min-h-[280px] sm:min-h-[360px] md:min-h-[420px] lg:min-h-[500px] border-b lg:border-b-0 lg:border-r border-[#262626] overflow-hidden">
            {/* Background image */}
            {spotlight?.imageUrl && !imageErrors[spotlight.id] ? (
              <Image
                src={spotlight.imageUrl}
                alt={spotlight.name || "Spotlight"}
                fill
                unoptimized
                className="object-cover object-center"
                onError={() => markImageError(spotlight.id)}
              />
            ) : (
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,#0f0f0f,transparent_45%),radial-gradient(circle_at_80%_30%,#111,transparent_40%),#000] flex items-center justify-center">
                <span className="text-4xl sm:text-5xl font-black text-white/10">{spotlight?.name?.charAt(0)?.toUpperCase() || "S"}</span>
              </div>
            )}
            {/* Gradient overlay for text readability */}
            <div className="absolute inset-0 z-10 bg-gradient-to-t from-black via-black/70 to-black/20" />
            <div className="absolute inset-0 z-10 bg-gradient-to-r from-black/60 to-transparent" />
            {/* Text content */}
            <div className="absolute inset-0 z-20 flex flex-col justify-end gap-4 sm:gap-7 p-4 sm:p-6 md:p-8 lg:p-8 pt-8 pb-6 sm:pt-18 sm:pb-16 lg:pt-12 lg:pb-10">
              <div className="space-y-2 md:space-y-3">
                <span className="inline-flex items-center gap-2 rounded-sm bg-white/15 px-3.5 py-1.5 text-[11px] font-mono uppercase tracking-[0.28em] text-[#CCFF00] border border-[#262626]">
                  IP OF THE DAY
                </span>
                <h1 className="text-2xl sm:text-3xl md:text-5xl font-black tracking-tight text-white drop-shadow-[0_10px_30px_rgba(0,0,0,0.6)]">
                  {spotlight?.name || "No IP yet"}
                </h1>
                <p className="text-[12px] sm:text-[13px] md:text-base text-white/70 max-w-2xl">
                  Spotlighted IP asset sourced from Story Protocol. Tap into the bonding curve and the royalty vault in one launch flow.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-[11px] md:text-xs font-mono uppercase tracking-[0.2em] text-white/70">
                <span className="rounded-sm border border-white/10 bg-black/40 px-3 py-1">
                  {spotlight ? formatMarketCapIP(spotlight.marketCap) : "—"}
                </span>
                <span className="rounded-sm border border-white/10 bg-black/40 px-3 py-1">
                  {spotlight ? `Progress ${Math.round(spotlight.bondingProgress || 0)}%` : "No data"}
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
              {loading ? (
                <div className="px-4 py-6 text-center text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                  Loading market movers...
                </div>
              ) : marketMovers.map((item) => {
                    const key = item.token || item.id;
                    const pct = typeof item.dailyChangePct === "number" && isFinite(item.dailyChangePct)
                      ? item.dailyChangePct
                      : null;
                    const pctLabel = pct === null ? "—" : `${pct > 0 ? "+" : ""}${pct.toFixed(2)}%`;
                    return (
                      <Link
                        key={key}
                        href={`/pool/${item.token || item.id}`}
                        className="flex items-center gap-3 px-4 py-3 group hover:bg-white/5 transition-colors"
                      >
                        <div className="w-12 h-12 rounded-sm overflow-hidden border border-[#262626] bg-[radial-gradient(circle_at_30%_20%,#1f1f1f,#080808_70%)] relative">
                          {item.imageUrl && !imageErrors[item.id] ? (
                            <Image
                              src={item.imageUrl}
                              alt={item.name || "IP"}
                              fill
                              unoptimized
                              className="object-cover"
                              onError={() => markImageError(item.id)}
                            />
                          ) : (
                            <div className="absolute inset-0 bg-[#111] flex items-center justify-center">
                              <span className="text-sm font-semibold text-white/20">{(item.name || "?").charAt(0).toUpperCase()}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-foreground truncate">{item.name || "Untitled IP"}</div>
                          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">24h change</div>
                        </div>
                        <div className="flex flex-col items-end text-right">
                          <span className={`text-[13px] font-semibold font-mono ${
                            pct !== null && pct >= 0 ? "text-[#CCFF00]" : pct !== null && pct < 0 ? "text-red-400" : "text-muted-foreground"
                          }`}>{pctLabel}</span>
                          <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                            {formatMarketCapIP(item.volume24h || item.marketCap)}
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

          {/* Mobile card layout */}
          <div className="md:hidden divide-y divide-[#1a1a1a]">
            {loading
              ? (
                  <div className="px-4 py-6 text-center text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                    Loading market board...
                  </div>
                )
              : terminalRows.length === 0
                ? (
                    <div className="px-4 py-8 text-center text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                      No data available
                    </div>
                  )
                : terminalRows.map((row) => {
                    const change = row.dailyChangePct ?? 0;
                    const isUp = change >= 0;
                    return (
                      <Link
                        key={row.id}
                        href={`/pool/${row.tokenAddress}`}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors active:bg-white/10"
                      >
                        <div className="relative h-10 w-10 rounded-sm overflow-hidden border border-[#262626] bg-[radial-gradient(circle_at_30%_20%,#1f1f1f,#080808_70%)] flex-shrink-0">
                          {row.imageUrl && !imageErrors[row.id] ? (
                            <Image
                              src={row.imageUrl}
                              alt={row.name}
                              fill
                              unoptimized
                              className="object-cover"
                              onError={() => markImageError(row.id)}
                            />
                          ) : (
                            <div className="absolute inset-0 bg-[#0d0d0d] flex items-center justify-center">
                              <span className="text-xs font-semibold text-white/20">{row.name.charAt(0).toUpperCase()}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-foreground truncate">{row.name}</span>
                            <span
                              className={`text-[11px] font-mono tabular-nums flex-shrink-0 ${
                                isUp ? "text-[#CCFF00]" : "text-red-400"
                              }`}
                            >
                              {isUp ? "▲" : "▼"} {priceLabel(row)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2 mt-1">
                            <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{row.symbol}</span>
                            <div className="flex items-center gap-2">
                              <div className="h-1 w-12 bg-[#0f0f0f] rounded-sm overflow-hidden">
                                <div className="h-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, row.bondingProgress))}%` }} />
                              </div>
                              <span className="text-[10px] font-mono tabular-nums text-muted-foreground">{Math.round(row.bondingProgress)}%</span>
                              {row.graduated && (
                                <span className="text-[9px] font-mono uppercase tracking-[0.15em] text-[#CCFF00]">GRAD</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
          </div>

          {/* Desktop table layout */}
          <div className="hidden md:block overflow-x-auto">
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
                  ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                          Loading market board...
                        </td>
                      </tr>
                    )
                  : terminalRows.length === 0
                    ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-6 text-center text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                            No data available
                          </td>
                        </tr>
                      )
                    : terminalRows.map((row) => {
                        const change = row.dailyChangePct ?? 0;
                        const isUp = change >= 0;
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
                                <div className="relative h-10 w-10 rounded-sm overflow-hidden border border-[#262626] bg-[radial-gradient(circle_at_30%_20%,#1f1f1f,#080808_70%)]">
                                  {row.imageUrl && !imageErrors[row.id] ? (
                                    <Image
                                      src={row.imageUrl}
                                      alt={row.name}
                                      fill
                                      unoptimized
                                      className="object-cover"
                                      onError={() => markImageError(row.id)}
                                    />
                                  ) : (
                                    <div className="absolute inset-0 bg-[#0d0d0d] flex items-center justify-center">
                                      <span className="text-xs font-semibold text-white/20">{row.name.charAt(0).toUpperCase()}</span>
                                    </div>
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
                                }`}
                              >
                                <span className="text-[10px] opacity-70">{isUp ? "▲" : "▼"}</span>
                                {priceLabel(row)}
                              </span>
                            </td>
                            <td className="px-4 py-3 border-r border-[#1a1a1a]">
                              <div className="flex items-center gap-3">
                                <div className="relative h-2 w-full max-w-[8rem] bg-[#0f0f0f] rounded-sm overflow-hidden">
                                  <div
                                    className="absolute inset-y-0 left-0 bg-[#CCFF00]/80"
                                    style={{ width: `${volumePct}%` }}
                                  />
                                </div>
                                <span className="text-[11px] tabular-nums text-muted-foreground whitespace-nowrap">{formatMarketCapIP(String(volume))}</span>
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

    </div>
  );
}
