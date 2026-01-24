"use client";

import Image from "next/image";
import Link from "next/link";

import { useLaunches } from "@/hooks/useLaunches";
import { formatMarketCapIP, truncateAddress } from "@/lib/utils";

export default function Home() {
  const { launches, loading, error, retry } = useLaunches(24);
  const gridLaunches = launches.slice(0, 8);
  const tickerLaunches = launches.slice(0, 12);

  return (
    <div className="w-full">
      {/* Zone A: Asset Grid Hero */}
      <section className="border-b border-[#262626]">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-px bg-[#262626] border-b border-[#262626]">
          {loading
            ? Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="bg-[#0A0A0A] flex flex-col min-h-[260px]">
                  <div className="flex-[7] bg-[#111111]" />
                  <div className="flex-[3] border-t border-[#262626] px-3 py-2 space-y-2">
                    <div className="h-3 w-20 bg-[#1f1f1f]" />
                    <div className="h-2 w-32 bg-[#1f1f1f]" />
                    <div className="h-2 w-16 bg-[#1f1f1f]" />
                  </div>
                </div>
              ))
            : gridLaunches.length === 0
            ? (
                <div className="col-span-full bg-[#0A0A0A] px-6 py-12 text-center text-xs font-mono uppercase tracking-[0.3em] text-muted-foreground">
                  No assets available
                </div>
              )
            : gridLaunches.map((launch) => {
                const tokenAddress = launch.token || launch.id;
                const displaySymbol = (launch.symbol || launch.name || "TOKEN")
                  .toString()
                  .slice(0, 8)
                  .toUpperCase();
                const displayName = launch.name || "Untitled IP";
                const marketCapLabel = formatMarketCapIP(launch.marketCap);
                return (
                  <Link
                    key={tokenAddress}
                    href={`/pool/${tokenAddress}`}
                    className="bg-[#0A0A0A] flex flex-col min-h-[260px] hover:bg-[#101010] transition-colors"
                  >
                    <div className="relative flex-[7] border-b border-[#262626] bg-black">
                      {launch.imageUrl ? (
                        <Image
                          src={launch.imageUrl}
                          alt={displayName}
                          fill
                          unoptimized
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-[#090909]">
                          <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">
                            No Signal
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex-[3] border-t border-[#262626] px-3 py-2 space-y-2">
                      <div className="text-[11px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                        {displaySymbol}
                      </div>
                      <div className="text-sm font-semibold text-foreground truncate">{displayName}</div>
                      <div className="text-[11px] font-mono text-muted-foreground">
                        {marketCapLabel}
                      </div>
                    </div>
                  </Link>
                );
              })}
        </div>
      </section>

      {/* Zone B: Ticker */}
      <section className="px-4 sm:px-6 py-6">
        <div className="border border-[#262626] bg-[#0A0A0A]">
          <div className="flex items-center justify-between px-4 py-3 border-b-2 border-[#262626]">
            <h2 className="text-[11px] font-sans uppercase tracking-[0.3em] text-muted-foreground">
              Market Ticker
            </h2>
            {error && (
              <button
                type="button"
                onClick={retry}
                className="text-[10px] font-mono uppercase tracking-[0.2em] text-primary"
              >
                Retry
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="text-[10px] font-sans uppercase tracking-[0.3em] text-muted-foreground">
                <tr className="border-b border-[#262626]">
                  <th className="px-4 py-3 text-left">Asset</th>
                  <th className="px-4 py-3 text-left">Market Cap</th>
                  <th className="px-4 py-3 text-left">Progress</th>
                  <th className="px-4 py-3 text-left">Creator</th>
                  <th className="px-4 py-3 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="text-[11px] font-mono text-foreground">
                {loading ? (
                  Array.from({ length: 6 }).map((_, index) => (
                    <tr key={index} className="border-b border-[#262626]">
                      <td className="px-4 py-3">
                        <div className="h-3 w-24 bg-[#1f1f1f]" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="h-3 w-20 bg-[#1f1f1f]" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="h-3 w-12 bg-[#1f1f1f]" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="h-3 w-28 bg-[#1f1f1f]" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="h-3 w-12 bg-[#1f1f1f]" />
                      </td>
                    </tr>
                  ))
                ) : tickerLaunches.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-6 text-center text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground"
                    >
                      No data available
                    </td>
                  </tr>
                ) : (
                  tickerLaunches.map((launch) => {
                    const tokenAddress = launch.token || launch.id;
                    const symbol = (launch.symbol || launch.name || "TOKEN")
                      .toString()
                      .slice(0, 8)
                      .toUpperCase();
                    const marketCapLabel = formatMarketCapIP(launch.marketCap);
                    const progress = `${Math.round(launch.bondingProgress || 0)}%`;
                    const creator = truncateAddress(launch.creator, {
                      start: 6,
                      end: 4,
                      separator: "…",
                      minLength: 10,
                    });
                    return (
                      <tr
                        key={tokenAddress}
                        className="border-b border-[#262626] hover:bg-[#111111]"
                      >
                        <td className="px-4 py-3">
                          <Link href={`/pool/${tokenAddress}`} className="hover:text-primary">
                            {symbol}
                          </Link>
                        </td>
                        <td className="px-4 py-3 tabular-nums">{marketCapLabel}</td>
                        <td className="px-4 py-3 tabular-nums">{progress}</td>
                        <td className="px-4 py-3 tabular-nums">{creator}</td>
                        <td className="px-4 py-3">
                          {launch.graduated ? "GRADUATED" : "LIVE"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
