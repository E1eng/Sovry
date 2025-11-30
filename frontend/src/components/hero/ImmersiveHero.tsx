"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { PlusCircle } from "lucide-react";
import { TrendingFloat } from "./TrendingFloat";

export function ImmersiveHero() {
  const targetValue = 98375.19;
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const duration = 2000; // 2 seconds
    const startTime = Date.now();
    const startValue = 0;

    const animate = () => {
      const now = Date.now();
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Easing function (ease-out)
      const easeOut = 1 - Math.pow(1 - progress, 3);

      const currentValue = startValue + (targetValue - startValue) * easeOut;
      setDisplayValue(currentValue);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setDisplayValue(targetValue);
      }
    };

    // Start animation after a small delay
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

  return (
    <div className="relative h-screen min-h-[500px] w-full overflow-hidden">
      {/* Background Image with Gradient Mask */}
      <div className="absolute inset-0">
        {/* Gradient Overlays */}
        <div className="absolute inset-0 bg-gradient-to-r from-zinc-950 via-zinc-950/60 to-transparent z-10" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-zinc-950/30 to-zinc-950 z-10" />
        
        {/* Background Image - Using CSS background for better compatibility */}
        <div
          className="absolute inset-0 bg-center bg-no-repeat"
          style={{
            backgroundImage: "url('/background.gif')",
            backgroundColor: "#09090B", // Fallback void black
            backgroundSize: "100% 100%", // Stretches to fill
          }}
        />
        
        {/* Fallback gradient if image fails to load */}
        <div className="absolute inset-0 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 opacity-0 hover:opacity-0" />
      </div>

      {/* Trending Float Card */}
      <TrendingFloat />

      {/* Content */}
      <div className="relative z-20 h-full flex items-center">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            {/* Stats Badge */}
            <div className="mb-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900/50 backdrop-blur-sm border border-zinc-800">
                <div className="w-2 h-2 rounded-full bg-primary" />
                <span className="text-xs text-zinc-400">4292 Tokens Created</span>
              </div>
            </div>

            {/* Main Headline */}
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-zinc-50 mb-4 leading-tight">
              Sovry Launchpad.
            </h1>

            {/* Subtext */}
            <p className="text-lg sm:text-xl text-zinc-400 mb-8 max-w-xl">
              Register your IP. Launch your token on a bonding curve.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-wrap items-center gap-4 mb-8">
              <Link href="/create">
                <Button variant="buy" className="text-base px-6 py-3">
                  <PlusCircle className="h-5 w-5 mr-2" />
                  Create IP
                </Button>
              </Link>
              <Link
                href="#discover"
                className="text-zinc-50 hover:text-primary transition-colors font-medium"
              >
                Explore Tokens →
              </Link>
            </div>

            {/* Stats Box */}
            <div className="inline-block px-6 py-3 rounded-lg bg-zinc-900/50 backdrop-blur-sm border border-zinc-800">
              <div className="text-xs text-zinc-400 mb-1">Total IP rewards earned</div>
              <div className="text-2xl font-bold text-zinc-50">{formatCurrency(displayValue)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

