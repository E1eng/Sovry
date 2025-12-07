"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { PlusCircle, ArrowRight } from "lucide-react";
import { formatMarketCap } from "@/services/launchDataService";

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

export function ImmersiveHero({ tokenCount, liveCount, sampleLaunch }: ImmersiveHeroProps) {
  const targetValue = 98375.19;
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const duration = 2000;
    const startTime = Date.now();
    const startValue = 0;

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
  }, []);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const sampleName = sampleLaunch?.name ?? "Sovry Sample IP";
  const sampleSymbol = sampleLaunch?.symbol ?? "SVRY";
  const sampleMarketCap = sampleLaunch?.marketCap
    ? formatMarketCap(sampleLaunch.marketCap)
    : "2.30M IP";
  const sampleBonding =
    typeof sampleLaunch?.bondingProgress === "number"
      ? sampleLaunch.bondingProgress
      : 72.5;
  const sampleImageUrl = sampleLaunch?.imageUrl;

  return (
    <section className="px-4 md:px-6 pt-6 pb-8">
      <div className="relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 px-5 py-6 sm:px-8 sm:py-8 lg:px-10 lg:py-10">
        {/* Decorative glows */}
        <div className="pointer-events-none absolute -left-20 top-0 h-56 w-56 rounded-full bg-sovry-green/15 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-64 w-64 rounded-full bg-sovry-pink/10 blur-3xl" />

        <div className="relative flex flex-col lg:flex-row items-start gap-8 lg:gap-10">
          {/* Left: Text content */}
          <div className="flex-1 min-w-0 space-y-6">
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
                Launch IP-backed tokens in one place.
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
                <div className="text-[11px] sm:text-xs text-zinc-400">Total IP rewards earned</div>
                <div className="text-sm sm:text-lg font-semibold text-zinc-50">
                  {formatCurrency(displayValue)}
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
              {/* Preview header */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-zinc-800/80 flex items-center justify-center overflow-hidden">
                    {sampleImageUrl ? (
                      <img
                        src={sampleImageUrl}
                        alt={sampleName}
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

              {/* Preview body */}
              <div className="space-y-3 text-xs">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-zinc-400">
                    <div className="h-6 w-6 flex-shrink-0">
                      <img
                        src="/ip-badge-2.svg"
                        alt="IP badge"
                        className="h-full w-full object-contain"
                      />
                    </div>
                    <span className="truncate">Backed by on-chain IP registration</span>
                  </div>

                  {/* Infinite moving cards strip */}
                  <div className="relative mt-1 overflow-hidden rounded-md border border-zinc-800/80 bg-zinc-900/40">
                    <div className="flex animate-infinite-cards gap-2 px-3 py-2">
                      {Array.from({ length: 2 }).map((_, outerIndex) => (
                        <div key={outerIndex} className="flex gap-2">
                          {[
                            "IP Rights",
                            "Royalties",
                            "Liquidity",
                            "Collectors",
                          ].map((label) => (
                            <div
                              key={label + outerIndex}
                              className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-950/80 px-3 py-1 text-[11px] text-zinc-300 shadow-sm"
                            >
                              <span className="h-1.5 w-1.5 rounded-full bg-sovry-green" />
                              <span className="whitespace-nowrap">{label}</span>
                            </div>
                          ))}
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
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

