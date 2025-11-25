"use client";

import { useState, useEffect } from "react";

import { useDynamicContext } from "@dynamic-labs/sdk-react-core";

import { useParams } from "next/navigation";
import { Navigation } from "@/components/navigation/Navigation";
import SwapInterface from "@/components/swap/SwapInterface";
import BondingCurveChart from "@/components/chart/BondingCurveChart";
import CommentSection from "@/components/social/CommentSection";
import { launchpadService, type LaunchInfo } from "@/services/launchpadService";

// Pool Detail Interface
interface PoolDetail {
  id: string;
  address: string;
  token0: {
    symbol: string;
    name: string;
    address: string;
  };
  token1: {
    symbol: string;
    name: string;
    address: string;
  };
  ipAsset?: {
    id: string;
    name: string;
    description: string;
    image: string;
    thumbnail: string;
    owner: string;
    tokenId: string;
    licenseTerms: {
      commercialUse: boolean;
      derivativesAllowed: boolean;
      commercialRevShare: number;
      royaltyPolicy: string;
      transferable: boolean;
      uri: string;
    };
    metadata: {
      title: string;
      description: string;
      image: string;
      attributes: Array<{
        trait_type: string;
        value: string;
      }>;
    };
  };
  stats: {
    volume24h: number;
    volume7d: number;
    apr: number;
    tvl: number;
    fees24h: number;
    price: number;
    priceChange24h: number;
  };
}

const isValidAddress = (address?: string | null) => {
  if (!address) return false;
  return /^0x[0-9a-fA-F]{40}$/.test(address);
};

const SUBGRAPH_URL =
  process.env.NEXT_PUBLIC_SUBGRAPH_URL ||
  "https://api.goldsky.com/api/public/project_cmhxop6ixrx0301qpd4oi5bb4/subgraphs/sovry-aeneid/1.1.1/gn";

export default function PoolDetailPage() {
  const params = useParams();
  const poolAddress = params.address as string;
  const { primaryWallet } = useDynamicContext();

  const [pool, setPool] = useState<PoolDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [launchInfo, setLaunchInfo] = useState<LaunchInfo | null>(null);
  const [bondingProgress, setBondingProgress] = useState(0);
  const [launchTokenAddress, setLaunchTokenAddress] = useState<string | null>(null);
  const [curveData, setCurveData] = useState<{ time: number; value: number }[]>([]);
  const [harvesting, setHarvesting] = useState(false);
  const [harvestError, setHarvestError] = useState<string | null>(null);
  const [harvestSuccess, setHarvestSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchPoolDetail();
  }, [poolAddress]);

  const fetchPoolDetail = async () => {
    try {
      setLoading(true);
      setError(null);

      // First, try to load real pool data from backend API
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL;
        if (apiUrl) {
          const response = await fetch(`${apiUrl}/api/pools`);
          if (response.ok) {
            const payload = await response.json();
            const pools = Array.isArray(payload.data)
              ? payload.data
              : Array.isArray(payload.pools)
              ? payload.pools
              : [];

            const basePool = pools.find(
              (p: any) =>
                (p.address || p.id || "")
                  .toString()
                  .toLowerCase() === poolAddress.toLowerCase()
            );

            if (basePool) {
              const mappedPool: PoolDetail = {
                id: poolAddress,
                address: poolAddress,
                token0: {
                  symbol: basePool.token0Symbol || basePool.token0?.symbol || "UNKNOWN",
                  name: basePool.token0Symbol || basePool.token0?.name || "Token 0",
                  address: basePool.token0Address || basePool.token0?.id || "",
                },
                token1: {
                  symbol: basePool.token1Symbol || basePool.token1?.symbol || "UNKNOWN",
                  name: basePool.token1Symbol || basePool.token1?.name || "Token 1",
                  address: basePool.token1Address || basePool.token1?.id || "",
                },
                stats: {
                  volume24h: basePool.volume24hUSD || 0,
                  volume7d: basePool.volume7dUSD || basePool.volume24hUSD || 0,
                  apr: basePool.apr || 0,
                  tvl: basePool.tvlUSD || 0,
                  fees24h: basePool.fees24hUSD || 0,
                  price: basePool.priceUSD != null ? Number(basePool.priceUSD) : 0,
                  priceChange24h: 0,
                },
              };

              setPool(mappedPool);
              return;
            }
          }
        }
      } catch (apiError) {
        console.error("Failed to load pool from API, falling back to mock data", apiError);
      }

      // Mock data - akan diganti dengan real API call
      const mockPool: PoolDetail = {
        id: poolAddress,
        address: poolAddress,
        token0: {
          symbol: "WIP",
          name: "Wrapped IP Token",
          address: "0x1234...5678"
        },
        token1: {
          symbol: "rIP-MUSIC-001",
          name: "Music Stem Collection Vol.1",
          address: "0xabcd...efgh"
        },
        ipAsset: {
          id: "0x9876...5432",
          name: "Music Stem Collection Vol.1",
          description: "Professional music stems for producers including melodies, basslines, and drum patterns. All stems are royalty-free for commercial use with proper attribution.",
          image: "https://ttmbengqanqzfrkjajgk.supabase.co/storage/v1/object/public/images/pack-art/20874abc-latinpack.jpg",
          thumbnail: "https://ttmbengqanqzfrkjajgk.supabase.co/storage/v1/object/public/images/pack-art/20874abc-latinpack.jpg",
          owner: "0x1234...5678",
          tokenId: "1234",
          licenseTerms: {
            commercialUse: true,
            derivativesAllowed: true,
            commercialRevShare: 10,
            royaltyPolicy: "Story Protocol Royalty Standard",
            transferable: true,
            uri: "https://storyprotocol.xyz/license/1234"
          },
          metadata: {
            title: "Music Stem Collection Vol.1",
            description: "Professional music stems for producers",
            image: "https://ttmbengqanqzfrkjajgk.supabase.co/storage/v1/object/public/images/pack-art/20874abc-latinpack.jpg",
            attributes: [
              { trait_type: "Genre", value: "Latin, Pop, Dance" },
              { trait_type: "Tempo", value: "96-120 BPM" },
              { trait_type: "Key", value: "Various" },
              { trait_type: "Stem Count", value: "12" },
              { trait_type: "File Format", value: "WAV 24-bit" },
              { trait_type: "License", value: "Commercial" }
            ]
          }
        },
        stats: {
          volume24h: 125000,
          volume7d: 890000,
          apr: 15.8,
          tvl: 2500000,
          fees24h: 1250,
          price: 0.85,
          priceChange24h: 12.5
        }
      };

      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      setPool(mockPool);
    } catch (error) {
      console.error("Error fetching pool detail:", error);
      setError("Failed to load pool details. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Bonding curve data from real trades on Launchpad (via subgraph) with mock fallback
  useEffect(() => {
    const loadCurveData = async () => {
      if (!launchTokenAddress || !isValidAddress(launchTokenAddress)) {
        return;
      }

      try {
        const now = Math.floor(Date.now() / 1000);
        const from = now - 24 * 60 * 60; // last 24h

        const query = `
          query TradesForToken($token: Bytes!, $from: BigInt!) {
            trades(
              where: { token: $token, timestamp_gte: $from }
              orderBy: timestamp
              orderDirection: asc
            ) {
              timestamp
              amountIP
              amountTokens
            }
          }
        `;

        const res = await fetch(SUBGRAPH_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query,
            variables: {
              token: launchTokenAddress.toLowerCase(),
              from,
            },
          }),
        });

        if (!res.ok) {
          throw new Error("Subgraph request failed");
        }

        const json = await res.json();
        const trades = (json?.data?.trades || []) as Array<{
          timestamp: string;
          amountIP: string;
          amountTokens: string;
        }>;

        if (!trades.length) {
          throw new Error("No trades for token");
        }

        const points = trades
          .map((t) => {
            const ts = Number(t.timestamp || 0);
            if (!ts) return null;

            // Price in IP per token; both amounts are 18-decimal fixed-point
            const ip = Number(t.amountIP || "0");
            const tokens = Number(t.amountTokens || "0");
            if (!tokens) return null;

            const price = ip / tokens;
            return {
              time: ts,
              value: price,
            };
          })
          .filter((p): p is { time: number; value: number } => !!p);

        if (points.length) {
          setCurveData(points);
          return;
        }

        throw new Error("No valid trade points");
      } catch (e) {
        console.warn("Falling back to mock bonding curve data", e);

        // Fallback: old mock data (price increases over time)
        const initial: { time: number; value: number }[] = [];
        let price = 0.001;
        const startTime = Math.floor(Date.now() / 1000) - 100 * 60; // 100 minutes ago

        for (let i = 0; i < 100; i++) {
          price = price * (1 + Math.random() * 0.05); // random upside drift
          initial.push({
            time: startTime + i * 60,
            value: price,
          });
        }

        setCurveData(initial);
      }
    };

    loadCurveData();
  }, [launchTokenAddress]);

  useEffect(() => {
    const loadLaunchpadInfo = async () => {
      if (!pool) return;

      try {
        const WIP_ADDRESS = "0x1514000000000000000000000000000000000000".toLowerCase();
        const token0Addr = pool.token0.address?.toLowerCase();
        const token1Addr = pool.token1.address?.toLowerCase();

        let launchToken = token0Addr;
        if (token0Addr === WIP_ADDRESS && token1Addr) {
          launchToken = token1Addr;
        }

        if (!launchToken || !isValidAddress(launchToken)) return;

        setLaunchTokenAddress(launchToken);
        const info = await launchpadService.getLaunchInfo(launchToken);
        if (info) {
          setLaunchInfo(info);
          setBondingProgress(launchpadService.getBondingProgress(info));
        }
      } catch (e) {
        console.error("Failed to load launchpad info for pool", e);
      }
    };

    loadLaunchpadInfo();
  }, [pool]);

  const handleHarvestRoyalties = async () => {
    if (!launchTokenAddress || !primaryWallet) return;

    try {
      setHarvesting(true);
      setHarvestError(null);
      setHarvestSuccess(null);

      const result = await launchpadService.harvestAndPump(launchTokenAddress, primaryWallet);

      if (!result.success) {
        throw new Error(result.error || "Failed to harvest royalties");
      }

      setHarvestSuccess("Royalties harvested and injected into the bonding curve. Price may update shortly.");
    } catch (e) {
      setHarvestError(e instanceof Error ? e.message : "Failed to harvest royalties");
    } finally {
      setHarvesting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading pool analysis...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !pool) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="text-6xl mb-4">⚠️</div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Pool Not Found
            </h3>
            <p className="text-gray-600 mb-6">{error || "This pool doesn't exist or has been removed."}</p>
            <button 
              onClick={() => window.history.back()}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-4">
              <button
                onClick={() => window.history.back()}
                className="mt-1 text-muted-foreground hover:text-foreground transition-colors text-sm"
              >
                ← Back
              </button>
              <div>
                <h1 className="text-2xl font-bold text-foreground">
                  {pool.ipAsset?.metadata.title || pool.ipAsset?.name || `${pool.token1.symbol} / ${pool.token0.symbol}`}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {pool.token1.symbol} • Shared IP Coin
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Created by{" "}
                  <span className="font-mono">
                    {pool.ipAsset?.owner?.slice(0, 8)}…{pool.ipAsset?.owner?.slice(-4)}
                  </span>
                </p>
              </div>
            </div>
            <div className="text-right space-y-1">
              <div className="text-xs text-muted-foreground uppercase tracking-wide">
                Market Cap (approx)
              </div>
              <div className="text-xl font-semibold text-foreground">
                ${((pool.stats.tvl || 0) / 1_000_000).toFixed(2)}M
              </div>
              <div className="text-xs text-muted-foreground">
                Price ratio {pool.token1.symbol}/{pool.token0.symbol}: {pool.stats.price.toFixed(6)}
              </div>
            </div>
          </div>
          
          {/* Pool Stats Bar */}
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            <div className="rounded-lg border border-border/70 bg-card/70 px-3 py-2">
              <div className="text-muted-foreground mb-1">TVL</div>
              <div className="text-sm font-medium text-foreground">
                ${(pool.stats.tvl / 1_000_000).toFixed(2)}M
              </div>
            </div>
            <div className="rounded-lg border border-border/70 bg-card/70 px-3 py-2">
              <div className="text-muted-foreground mb-1">24h Volume</div>
              <div className="text-sm font-medium text-foreground">
                ${(pool.stats.volume24h / 1_000).toFixed(1)}K
              </div>
            </div>
            <div className="rounded-lg border border-border/70 bg-card/70 px-3 py-2">
              <div className="text-muted-foreground mb-1">APR</div>
              <div className="text-sm font-medium text-emerald-400">
                {pool.stats.apr}%
              </div>
            </div>
            <div className="rounded-lg border border-border/70 bg-card/70 px-3 py-2">
              <div className="text-muted-foreground mb-1">Trades Mode</div>
              <div className="text-sm font-medium text-foreground">
                {launchInfo?.graduated ? "DEX (Sovry Router)" : "Bonding Curve (Launchpad)"}
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1.2fr)] gap-8">
          {/* Left Column - Visuals & Social */}
          <div className="space-y-6">
            <div className="rounded-xl border border-border/70 bg-card/80 p-4">
              <BondingCurveChart data={curveData} />
            </div>

            <div className="rounded-xl border border-border/70 bg-card/80 p-6 space-y-6">
              <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                🔍 IP Asset Analysis
              </h2>
              
              {/* Large IP Image */}
              <div className="mb-2">
                <img
                  src={pool.ipAsset?.image}
                  alt={pool.ipAsset?.name}
                  className="w-full h-72 object-cover rounded-lg border border-border/60"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.src = '/placeholder-ip.png';
                  }}
                />
              </div>

              {/* Metadata */}
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  {pool.ipAsset?.metadata.title}
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {pool.ipAsset?.metadata.description}
                </p>
                
                {/* Asset Details */}
                <div className="grid grid-cols-2 gap-4 mb-4 text-xs">
                  <div>
                    <div className="text-muted-foreground">Owner</div>
                    <div className="font-mono text-foreground mt-1">
                      {pool.ipAsset?.owner}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Token ID</div>
                    <div className="font-mono text-foreground mt-1">
                      #{pool.ipAsset?.tokenId}
                    </div>
                  </div>
                </div>
              </div>

              {/* PIL Terms - Legal Foundation */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  ⚖️ License Terms (Legal Foundation)
                </h3>
                <div className="bg-muted/40 rounded-lg p-4 space-y-3 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-foreground">Commercial Use</span>
                    <span className={`px-2 py-1 rounded text-[11px] font-medium ${
                      pool.ipAsset?.licenseTerms.commercialUse 
                        ? 'bg-emerald-500/20 text-emerald-300' 
                        : 'bg-red-500/20 text-red-300'
                    }`}>
                      {pool.ipAsset?.licenseTerms.commercialUse ? 'Allowed' : 'Restricted'}
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-foreground">Derivatives Allowed</span>
                    <span className={`px-2 py-1 rounded text-[11px] font-medium ${
                      pool.ipAsset?.licenseTerms.derivativesAllowed 
                        ? 'bg-emerald-500/20 text-emerald-300' 
                        : 'bg-red-500/20 text-red-300'
                    }`}>
                      {pool.ipAsset?.licenseTerms.derivativesAllowed ? 'Yes' : 'No'}
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-foreground">Royalty Share</span>
                    <span className="px-2 py-1 rounded text-[11px] font-medium bg-blue-500/20 text-blue-200">
                      {pool.ipAsset?.licenseTerms.commercialRevShare}% of on-chain revenue
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-foreground">Transferable</span>
                    <span className={`px-2 py-1 rounded text-[11px] font-medium ${
                      pool.ipAsset?.licenseTerms.transferable 
                        ? 'bg-emerald-500/20 text-emerald-300' 
                        : 'bg-red-500/20 text-red-300'
                    }`}>
                      {pool.ipAsset?.licenseTerms.transferable ? 'Yes' : 'No'}
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-start gap-3">
                    <span className="font-medium text-foreground">Royalty Policy</span>
                    <span className="text-[11px] text-muted-foreground max-w-xs text-right">
                      {pool.ipAsset?.licenseTerms.royaltyPolicy}
                    </span>
                  </div>
                  
                  {pool.ipAsset?.licenseTerms.uri && (
                    <div className="pt-2 border-t border-border/60">
                      <a 
                        href={pool.ipAsset.licenseTerms.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-1"
                      >
                        📄 View Full License Document
                        <span>→</span>
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Attributes */}
              {pool.ipAsset?.metadata.attributes && (
                <div className="mt-6">
                  <h3 className="text-sm font-semibold text-foreground mb-3">
                    🏷️ Asset Attributes
                  </h3>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    {pool.ipAsset.metadata.attributes.map((attr, index) => (
                      <div key={index} className="bg-muted/40 rounded-lg p-3">
                        <div className="text-[11px] text-muted-foreground mb-1">{attr.trait_type}</div>
                        <div className="text-sm font-medium text-foreground">{attr.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <CommentSection tokenAddress={launchTokenAddress || pool.address} />

          </div>

          {/* Right Column - Trading */}
          <div className="space-y-6">
            {launchInfo && launchTokenAddress && (
              <div className="rounded-xl border border-border/70 bg-card/80 p-4 space-y-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Harvest Royalties</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Claim pending royalties from Story Protocol to this pool's Launchpad vault and inject them into the
                  bonding curve reserve. This can instantly boost the token price for all holders.
                </p>
                <button
                  onClick={handleHarvestRoyalties}
                  disabled={harvesting || !primaryWallet}
                  className="w-full text-xs px-3 py-2 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {harvesting ? "Harvesting Royalties…" : "Harvest Royalties"}
                </button>
                {harvestSuccess && (
                  <p className="text-[11px] text-emerald-400 mt-1">{harvestSuccess}</p>
                )}
                {harvestError && (
                  <p className="text-[11px] text-red-400 mt-1">{harvestError}</p>
                )}
              </div>
            )}

            {launchInfo && (
              <div className="rounded-xl border border-border/70 bg-card/80 p-4">
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                  <span className="font-medium text-foreground">Bonding Curve Progress</span>
                  <span>
                    {(Number(launchInfo.totalRaised) / 1e18).toFixed(2)} IP / 100 IP
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-2 bg-primary"
                    style={{ width: `${bondingProgress}%` }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>
                    {bondingProgress >= 100
                      ? "Graduated to DEX"
                      : `~${Math.round(bondingProgress)}% to graduation`}
                  </span>
                  {launchTokenAddress && (
                    <span className="font-mono">
                      Token {launchTokenAddress.slice(0, 6)}…{launchTokenAddress.slice(-4)}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Swap Interface */}
            <div className="rounded-xl border border-border/70 bg-card/80 p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                💱 Trade {pool.token0.symbol} / {pool.token1.symbol}
              </h2>
              <SwapInterface
                defaultFromToken={pool.token0.symbol}
                defaultToToken={pool.token1.symbol}
              />
            </div>

            {/* Pool Performance */}
            <div className="rounded-xl border border-border/70 bg-card/80 p-6">
              <h3 className="text-sm font-semibold text-foreground mb-4">
                📈 Holder Distribution (mock)
              </h3>
              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-foreground">0xCreator...1234</span>
                  <span className="text-muted-foreground">45% supply</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-foreground">0xLPVault...9ab2</span>
                  <span className="text-muted-foreground">30% supply</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-foreground">0xFans...88ff</span>
                  <span className="text-muted-foreground">25% supply</span>
                </div>
              </div>
            </div>

            {/* Investment Thesis */}
            <div className="rounded-xl border border-border/70 bg-card/80 p-6">
              <h3 className="text-sm font-semibold text-foreground mb-4">
                💡 Investment Thesis
              </h3>
              <div className="space-y-3 text-xs text-muted-foreground">
                <p>
                  <strong>Revenue Potential:</strong> This IP asset generates royalties through commercial licensing with a {pool.ipAsset?.licenseTerms.commercialRevShare}% share rate.
                </p>
                <p>
                  <strong>Market Demand:</strong> {pool.ipAsset?.metadata.attributes.find(a => a.trait_type === 'Genre')?.value} content shows strong trading volume with {(pool.stats.volume24h / 1000).toFixed(1)}K in 24h.
                </p>
                <p>
                  <strong>Legal Protection:</strong> Full commercial rights and derivative permissions provide flexible monetization options.
                </p>
                <p>
                  <strong>Yield Opportunity:</strong> Current APR of {pool.stats.apr}% includes both trading fees and potential royalty distributions.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}