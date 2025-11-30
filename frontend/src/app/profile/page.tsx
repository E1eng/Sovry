"use client";

import { useState, useEffect } from "react";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { ethers } from "ethers";
import { useSearchParams } from "next/navigation";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

import { RevenueClaiming } from "@/components/revenue/RevenueClaiming";
import { fetchWalletIPAssets } from "@/services/storyProtocolService";
import UserProfile from "@/components/social/UserProfile";

import {
  DollarSign,
  TrendingUp,
  Gift,
  CheckCircle,
  Coins,
  Droplets,
  Database,
  Percent,
  Loader2,
} from "lucide-react";

// ===== Holdings (from Portfolio) =====
interface PortfolioAsset {
  id: string;
  symbol: string;
  name: string;
  image: string;
  balance: number;
  valueUSD: number;
  claimableRevenue: number;
  apy: string;
  category: string;
}

const MOCK_ASSETS: PortfolioAsset[] = [
  {
    id: "1",
    symbol: "rMUSIC",
    name: "Music Royalties",
    image:
      "https://ttmbengqanqzfrkjajgk.supabase.co/storage/v1/object/public/images/pack-art/20874abc-latinpack.jpg",
    balance: 1250.5,
    valueUSD: 1563.12,
    claimableRevenue: 45.8,
    apy: "15.8%",
    category: "Music",
  },
  {
    id: "2",
    symbol: "rART",
    name: "Art Royalties",
    image: "https://cdn.pixabay.com/photo/2024/02/28/07/42/easter-8601492_640.jpg",
    balance: 890.25,
    valueUSD: 1112.81,
    claimableRevenue: 28.45,
    apy: "12.3%",
    category: "Art",
  },
  {
    id: "3",
    symbol: "rGAME",
    name: "Game Royalties",
    image: "https://cdn.pixabay.com/photo/2024/01/25/10/38/minecraft-8532000_640.png",
    balance: 2100.0,
    valueUSD: 1365.0,
    claimableRevenue: 67.2,
    apy: "18.2%",
    category: "Gaming",
  },
  {
    id: "4",
    symbol: "$WIP",
    name: "Wrapped IP Token",
    image: "https://cdn.pixabay.com/photo/2024/01/25/10/38/minecraft-8532000_640.png",
    balance: 5000.0,
    valueUSD: 5000.0,
    claimableRevenue: 0,
    apy: "0%",
    category: "Base Token",
  },
  {
    id: "5",
    symbol: "rPHOTO",
    name: "Photography Royalties",
    image: "https://cdn.pixabay.com/photo/2024/02/28/07/42/easter-8601492_640.jpg",
    balance: 450.75,
    valueUSD: 563.44,
    claimableRevenue: 12.3,
    apy: "8.7%",
    category: "Photography",
  },
];

// ===== My Liquidity (from Liquidity page) =====
interface UserPool {
  id: string;
  token0: {
    id: string;
    symbol: string;
    name: string;
  };
  token1: {
    id: string;
    symbol: string;
    name: string;
  };
  reserve0: string;
  reserve1: string;
  totalSupply: string;
  volumeUSD: string;
  txCount: string;
  createdAtTimestamp: string;
  userLpBalance?: string;
  userLpPercentage?: number;
  tvlUSD?: number;
  userTVL?: number;
}

const TOKEN_MAPPING: Record<string, { symbol: string; name: string }> = {
  "0x1514000000000000000000000000000000000000": {
    symbol: "WIP",
    name: "Wrapped IP",
  },
  "0xb6b837972cfb487451a71279fa78c327bb27646e": {
    symbol: "RT",
    name: "Royalty Token",
  },
};

const formatNumber = (value: string | number) => {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
  if (num < 0.01 && num > 0) return num.toExponential(2);
  if (num < 1) return num.toFixed(6);
  return num.toFixed(2);
};

const formatDate = (timestamp: string) => {
  return new Date(parseInt(timestamp) * 1000).toLocaleDateString();
};

export default function ProfilePage() {
  const { primaryWallet } = useDynamicContext();
  const isConnected = !!primaryWallet;
  const walletAddress = primaryWallet?.address;

  const getInitials = () => {
    const addr = walletAddress;
    if (!addr || addr.length < 4) return "U";
    return addr.slice(2, 4).toUpperCase();
  };

  const searchParams = useSearchParams();
  const initialTab =
    (searchParams.get("tab") as "holdings" | "revenue" | "liquidity") || "holdings";

  // Holdings state
  const [assets, setAssets] = useState<PortfolioAsset[]>([]);
  const [holdingsLoading, setHoldingsLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [lastClaimTime, setLastClaimTime] = useState<Date | null>(null);

  // My Liquidity state
  const [userPools, setUserPools] = useState<UserPool[]>([]);
  const [poolsLoading, setPoolsLoading] = useState(false);
  const [poolsError, setPoolsError] = useState<string | null>(null);
  const [selectedPoolForLiquidity, setSelectedPoolForLiquidity] = useState<UserPool | null>(null);
  const [liquidityMode, setLiquidityMode] = useState<"add" | "remove">("add");
  const [liquidityAmount0, setLiquidityAmount0] = useState("");
  const [liquidityAmount1, setLiquidityAmount1] = useState("");
  const [liquidityPercentage, setLiquidityPercentage] = useState(0);
  const [isLiquidityProcessing, setIsLiquidityProcessing] = useState(false);
  const [liquidityError, setLiquidityError] = useState("");
  const [liquiditySuccess, setLiquiditySuccess] = useState("");

  // Load holdings (mock)
  useEffect(() => {
    const loadHoldings = async () => {
      if (!walletAddress) {
        setAssets([]);
        setHoldingsLoading(false);
        return;
      }

      try {
        const ipAssets = await fetchWalletIPAssets(walletAddress, primaryWallet);

        if (ipAssets && ipAssets.length > 0) {
          const mappedAssets: PortfolioAsset[] = ipAssets.map((asset) => ({
            id: asset.ipId,
            symbol: "RT",
            name: asset.name,
            image: asset.imageUrl,
            balance: 0,
            valueUSD: 0,
            claimableRevenue: 0,
            apy: "0%",
            category: "IP",
          }));

          setAssets(mappedAssets);
        } else {
          setAssets([]);
        }
      } catch (error) {
        console.error("Error loading holdings from Story Protocol:", error);
        setAssets(MOCK_ASSETS);
      } finally {
        setHoldingsLoading(false);
      }
    };

    loadHoldings();
  }, [walletAddress, primaryWallet]);

  const calculateNetWorth = () => assets.reduce((total, asset) => total + asset.valueUSD, 0);
  const calculateTotalClaimable = () =>
    assets.reduce((total, asset) => total + asset.claimableRevenue, 0);

  const handleClaimAll = async () => {
    setClaiming(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      setAssets((prev) => prev.map((a) => ({ ...a, claimableRevenue: 0 })));
      setLastClaimTime(new Date());
    } finally {
      setClaiming(false);
    }
  };

  // Fetch user pools (external DEX API disabled for now)
  const fetchUserPools = async () => {
    if (!walletAddress) return;

    try {
      setPoolsLoading(true);
      setPoolsError(null);

      // Liquidity positions backend (localhost:3001) is not required for SovryLaunchpad v1.
      // For now, we simply clear any existing pools so the UI renders without errors.
      setUserPools([]);
    } catch (err) {
      console.error("Error handling user pools:", err);
      setPoolsError(null);
      setUserPools([]);
    } finally {
      setPoolsLoading(false);
    }
  };

  useEffect(() => {
    if (isConnected && walletAddress) {
      fetchUserPools();
    }
  }, [isConnected, walletAddress]);

  // My Liquidity: add/remove (legacy DEX functionality disabled)
  const handleAddLiquidityToPool = async () => {
    setLiquidityError(
      "Manual liquidity management has been disabled. SovryLaunchpad now graduates liquidity directly to PiperX."
    );
    setLiquiditySuccess("");
  };

  const handleRemoveLiquidityFromPool = async () => {
    setLiquidityError(
      "Manual liquidity management has been disabled. SovryLaunchpad now graduates liquidity directly to PiperX."
    );
    setLiquiditySuccess("");
  };

  const displayAddress =
    walletAddress && walletAddress.length > 8
      ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`
      : walletAddress || "Your wallet";

  const netWorth = calculateNetWorth();
  const totalClaimable = calculateTotalClaimable();
  const assetCount = assets.length;
  const poolCount = userPools.length;

  return (
    <>
        <section className="mb-8">
          <div className="h-40 sm:h-48 md:h-56 w-full rounded-3xl bg-gradient-to-r from-sovry-green/20 via-sovry-green/10 to-sovry-pink/20 shadow-lg border border-zinc-800" />
          <div className="-mt-12 sm:-mt-16 flex flex-col gap-4 md:flex-row md:items-end md:justify-between px-2 sm:px-4">
            <div className="flex items-end gap-4">
              <div className="flex h-20 w-20 md:h-24 md:w-24 items-center justify-center rounded-full bg-gradient-to-br from-sovry-green via-sovry-green/80 to-sovry-green/60 border-4 border-zinc-950 shadow-xl text-2xl font-bold text-black">
                {getInitials()}
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl sm:text-3xl font-semibold text-zinc-50">
                    {displayAddress}
                  </h1>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-zinc-400">
                  <span className="px-2 py-1 rounded-full bg-zinc-900/50 border border-zinc-800">
                    Sovry collector
                  </span>
                  <span className="px-2 py-1 rounded-full bg-zinc-900/50 border border-zinc-800">
                    Story Aeneid Testnet
                  </span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs mt-4 md:mt-0">
              <div className="rounded-xl bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 px-3 py-2">
                <div className="text-zinc-400 text-xs uppercase tracking-wide mb-1">Portfolio value</div>
                <div className="text-sm font-semibold text-zinc-50">
                  {new Intl.NumberFormat("en-US", {
                    style: "currency",
                    currency: "USD",
                  }).format(netWorth)}
                </div>
              </div>
              <div className="rounded-xl bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 px-3 py-2">
                <div className="text-zinc-400 text-xs uppercase tracking-wide mb-1">Claimable rewards</div>
                <div className="text-sm font-semibold text-sovry-green">
                  {new Intl.NumberFormat("en-US", {
                    style: "currency",
                    currency: "USD",
                  }).format(totalClaimable)}
                </div>
              </div>
              <div className="rounded-xl bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 px-3 py-2">
                <div className="text-zinc-400 text-xs uppercase tracking-wide mb-1">IP tokens</div>
                <div className="text-sm font-semibold text-zinc-50">{assetCount}</div>
              </div>
              <div className="rounded-xl bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 px-3 py-2">
                <div className="text-zinc-400 text-xs uppercase tracking-wide mb-1">Pools</div>
                <div className="text-sm font-semibold text-zinc-50">{poolCount}</div>
              </div>
            </div>
          </div>
        </section>

        <Tabs defaultValue={initialTab} className="space-y-6">
          <TabsList>
            <TabsTrigger value="holdings">Holdings</TabsTrigger>
            <TabsTrigger value="revenue">Revenue</TabsTrigger>
            <TabsTrigger value="liquidity">My Liquidity</TabsTrigger>
          </TabsList>

          {/* Holdings Tab */}
          <TabsContent value="holdings" className="space-y-6">
            {holdingsLoading ? (
              <div className="py-16 text-center">
                <Coins className="h-10 w-10 text-sovry-green mx-auto mb-4 animate-pulse" />
                <p className="text-zinc-400">Loading your holdings...</p>
              </div>
            ) : (
              <>
                {/* Net Worth */}
                <Card className="bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 rounded-xl">
                  <CardContent className="p-8 flex items-center justify-between">
                    <div>
                      <p className="text-zinc-400 text-sm uppercase tracking-wide mb-2">Net Worth</p>
                      <p className="text-4xl md:text-5xl font-bold text-zinc-50 tracking-tight">
                        {new Intl.NumberFormat("en-US", {
                          style: "currency",
                          currency: "USD",
                        }).format(calculateNetWorth())}
                      </p>
                      <p className="text-zinc-400 text-base leading-relaxed mt-2">
                        Total value of all your IP assets
                      </p>
                    </div>
                    <DollarSign className="h-16 w-16 text-sovry-green/40" />
                  </CardContent>
                </Card>

                {/* Claim All */}
                <Card className="bg-zinc-900/50 backdrop-blur-sm border border-sovry-green/30 rounded-xl">
                  <CardContent className="p-6 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Gift className="h-6 w-6 text-sovry-green" />
                        <h3 className="text-lg font-semibold text-zinc-50">Available to Claim</h3>
                      </div>
                      <p className="text-2xl font-bold text-sovry-green">
                        {new Intl.NumberFormat("en-US", {
                          style: "currency",
                          currency: "USD",
                        }).format(calculateTotalClaimable())}
                      </p>
                    </div>
                    <Button
                      onClick={handleClaimAll}
                      disabled={claiming || calculateTotalClaimable() === 0}
                      variant="default"
                      size="lg"
                    >
                      {claiming ? (
                        <>
                          <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent mr-2" />
                          Claiming...
                        </>
                      ) : (
                        <>
                          <Gift className="h-5 w-5 mr-2" />
                          Claim All Rewards
                        </>
                      )}
                    </Button>
                  </CardContent>
                  {lastClaimTime && (
                    <CardContent className="pt-0">
                      <Alert className="mt-4 border-sovry-green/30 bg-sovry-green/10">
                        <CheckCircle className="h-4 w-4 text-sovry-green" />
                        <AlertDescription className="text-zinc-400">
                          Successfully claimed rewards at {lastClaimTime.toLocaleTimeString()}
                        </AlertDescription>
                      </Alert>
                    </CardContent>
                  )}
                </Card>

                {/* Assets Table */}
                <Card className="bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 rounded-xl">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg font-semibold text-zinc-50">
                      <TrendingUp className="h-5 w-5 text-sovry-green" />
                      My Assets
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-zinc-800">
                            <th className="text-left py-3 px-4 text-sm font-medium text-zinc-400 uppercase tracking-wide">
                              Asset
                            </th>
                            <th className="text-right py-3 px-4 text-sm font-medium text-zinc-400 uppercase tracking-wide">
                              Balance
                            </th>
                            <th className="text-right py-3 px-4 text-sm font-medium text-zinc-400 uppercase tracking-wide">
                              Value
                            </th>
                            <th className="text-right py-3 px-4 text-sm font-medium text-zinc-400 uppercase tracking-wide">
                              Claimable Revenue
                            </th>
                            <th className="text-right py-3 px-4 text-sm font-medium text-zinc-400 uppercase tracking-wide">
                              APY
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {assets.map((asset) => (
                            <tr
                              key={asset.id}
                              className="border-b border-zinc-800/50 hover:bg-zinc-800/30"
                            >
                              <td className="py-4 px-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 bg-zinc-800/30 rounded-lg overflow-hidden border border-zinc-700">
                                    <img
                                      src={asset.image}
                                      alt={asset.name}
                                      className="w-full h-full object-cover"
                                    />
                                  </div>
                                  <div>
                                    <p className="font-medium text-zinc-50">{asset.symbol}</p>
                                    <p className="text-sm text-zinc-400">{asset.name}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="text-right py-4 px-4 text-zinc-50">
                                {asset.balance.toFixed(2)}
                              </td>
                              <td className="text-right py-4 px-4 text-zinc-50">
                                {new Intl.NumberFormat("en-US", {
                                  style: "currency",
                                  currency: "USD",
                                }).format(asset.valueUSD)}
                              </td>
                              <td className="text-right py-4 px-4">
                                {asset.claimableRevenue > 0 ? (
                                  <span className="inline-flex items-center gap-1 bg-sovry-green/25 text-sovry-green px-3 py-1 rounded-full text-xs font-medium border border-sovry-green/40">
                                    {new Intl.NumberFormat("en-US", {
                                      style: "currency",
                                      currency: "USD",
                                    }).format(asset.claimableRevenue)}
                                  </span>
                                ) : (
                                  <span className="text-zinc-400">-</span>
                                )}
                              </td>
                              <td className="text-right py-4 px-4">
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-sovry-green/20 text-sovry-green border border-sovry-green/30">
                                  {asset.apy}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* Revenue Tab */}
          <TabsContent value="revenue">
            <div className="space-y-4">
              <UserProfile />
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle>Revenue</CardTitle>
                </CardHeader>
                <CardContent>
                  <RevenueClaiming />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* My Liquidity Tab */}
          <TabsContent value="liquidity" className="space-y-6">
            {!isConnected ? (
              <Card className="glass-card">
                <CardContent className="py-10 text-center">
                  <p className="text-muted-foreground">
                    Connect your wallet to view and manage your liquidity positions.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                <Card className="bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 rounded-xl">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg font-semibold text-zinc-50">
                      <Droplets className="h-5 w-5 text-sovry-green" />
                      Your Liquidity Pools
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {poolsLoading ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-6 w-6 animate-spin text-sovry-green" />
                        <span className="ml-3 text-zinc-400">Loading your pools...</span>
                      </div>
                    ) : poolsError ? (
                      <Alert variant="destructive">
                        <AlertDescription>{poolsError}</AlertDescription>
                      </Alert>
                    ) : userPools.length === 0 ? (
                      <div className="p-8 text-center text-zinc-400">
                        You don't have any liquidity positions yet.
                      </div>
                    ) : (
                      <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                          {userPools.map((pool) => (
                            <Card
                              key={pool.id}
                              className="bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 rounded-xl hover:border-sovry-green/50 transition-all duration-300"
                            >
                              <CardContent className="p-5 space-y-4">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <div className="p-2 bg-sovry-green/20 rounded-lg border border-sovry-green/30">
                                      <Droplets className="h-4 w-4 text-sovry-green" />
                                    </div>
                                    <div>
                                      <h3 className="font-semibold text-zinc-50 text-sm">
                                        {pool.token0?.symbol ?? "UNKNOWN"} / {pool.token1?.symbol ?? "UNKNOWN"}
                                      </h3>
                                      <div className="flex items-center gap-2 mt-1">
                                        <span className="w-2 h-2 bg-sovry-green rounded-full animate-pulse" />
                                        <span className="text-xs text-sovry-green">Active</span>
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                <div className="space-y-2 text-xs text-zinc-400">
                                  <div className="flex justify-between">
                                    <span>Reserve 0</span>
                                    <span className="text-zinc-50">{formatNumber(pool.reserve0)}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>Reserve 1</span>
                                    <span className="text-zinc-50">{formatNumber(pool.reserve1)}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>Volume USD</span>
                                    <span className="text-sovry-green">
                                      ${formatNumber(pool.volumeUSD)}
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>Your LP Balance</span>
                                    <span className="text-zinc-50">
                                      {pool.userLpBalance || "0"} LP
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>Your Share</span>
                                    <span className="text-sovry-green">
                                      {pool.userLpPercentage?.toFixed(2) || "0.00"}%
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>Created</span>
                                    <span className="text-zinc-50">{formatDate(pool.createdAtTimestamp)}</span>
                                  </div>
                                </div>

                                <div className="pt-3 border-t border-zinc-800 space-y-2">
                                  <Button
                                    size="sm"
                                    variant="default"
                                    className="w-full"
                                    onClick={() => {
                                      setSelectedPoolForLiquidity(pool);
                                      setLiquidityMode("add");
                                      setLiquidityAmount0("");
                                      setLiquidityAmount1("");
                                      setLiquidityPercentage(0);
                                      setLiquidityError("");
                                      setLiquiditySuccess("");
                                    }}
                                  >
                                    Add Liquidity
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="w-full"
                                    onClick={() => {
                                      setSelectedPoolForLiquidity(pool);
                                      setLiquidityMode("remove");
                                      setLiquidityAmount0("");
                                      setLiquidityAmount1("");
                                      setLiquidityPercentage(0);
                                      setLiquidityError("");
                                      setLiquiditySuccess("");
                                    }}
                                  >
                                    Remove Liquidity
                                  </Button>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>

                        {selectedPoolForLiquidity && (
                          <Card className="bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 rounded-xl">
                            <CardHeader>
                              <CardTitle className="flex items-center gap-2 text-lg font-semibold text-zinc-50">
                                <Droplets className="h-5 w-5 text-sovry-green" />
                                Manage Liquidity
                                <span className="text-xs text-zinc-400 font-normal">
                                  {selectedPoolForLiquidity.token0.symbol}/
                                  {selectedPoolForLiquidity.token1.symbol}
                                </span>
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                              {liquidityError && (
                                <Alert variant="destructive">
                                  <AlertDescription>{liquidityError}</AlertDescription>
                                </Alert>
                              )}
                              {liquiditySuccess && (
                                <Alert>
                                  <AlertDescription>{liquiditySuccess}</AlertDescription>
                                </Alert>
                              )}

                              {liquidityMode === "add" ? (
                                <div className="space-y-4">
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                      <Label className="flex items-center gap-1 mb-1">
                                        <span>{selectedPoolForLiquidity.token0.symbol}</span>
                                      </Label>
                                      <Input
                                        type="number"
                                        placeholder="0.0"
                                        value={liquidityAmount0}
                                        onChange={(e) => setLiquidityAmount0(e.target.value)}
                                      />
                                    </div>
                                    <div>
                                      <Label className="flex items-center gap-1 mb-1">
                                        <span>{selectedPoolForLiquidity.token1.symbol}</span>
                                      </Label>
                                      <Input
                                        type="number"
                                        placeholder="0.0"
                                        value={liquidityAmount1}
                                        onChange={(e) => setLiquidityAmount1(e.target.value)}
                                      />
                                    </div>
                                  </div>

                                  <Button
                                    onClick={handleAddLiquidityToPool}
                                    disabled={isLiquidityProcessing}
                                    className="w-full"
                                  >
                                    {isLiquidityProcessing ? (
                                      <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Adding Liquidity...
                                      </>
                                    ) : (
                                      "Add Liquidity"
                                    )}
                                  </Button>
                                </div>
                              ) : (
                                <div className="space-y-4">
                                  <div>
                                    <Label className="flex items-center gap-2 mb-2">
                                      <Percent className="h-4 w-4" /> LP Token Percentage
                                    </Label>
                                    <input
                                      type="range"
                                      min="0"
                                      max="100"
                                      value={liquidityPercentage}
                                      onChange={(e) => {
                                        const percentage = parseInt(e.target.value);
                                        setLiquidityPercentage(percentage);
                                        const maxLP = parseFloat(
                                          selectedPoolForLiquidity.userLpBalance || "0"
                                        );
                                        setLiquidityAmount0(
                                          ((maxLP * percentage) / 100).toString()
                                        );
                                      }}
                                      className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                                    />
                                    <div className="flex justify-between text-xs text-zinc-500 mt-1">
                                      <span>0%</span>
                                      <span>25%</span>
                                      <span>50%</span>
                                      <span>75%</span>
                                      <span>100%</span>
                                    </div>
                                  </div>

                                  <div>
                                    <Label className="text-zinc-400 text-sm font-medium uppercase tracking-wide mb-2">LP Token Amount</Label>
                                    <Input
                                      type="number"
                                      placeholder="0.0"
                                      value={liquidityAmount0}
                                      onChange={(e) => {
                                        setLiquidityAmount0(e.target.value);
                                        const maxLP = parseFloat(
                                          selectedPoolForLiquidity.userLpBalance || "0"
                                        );
                                        const percentage = Math.min(
                                          100,
                                          Math.round(
                                            ((parseFloat(e.target.value) || 0) / maxLP) * 100
                                          )
                                        );
                                        setLiquidityPercentage(percentage);
                                      }}
                                      className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3"
                                    />
                                  </div>

                                  <Button
                                    onClick={handleRemoveLiquidityFromPool}
                                    disabled={
                                      isLiquidityProcessing || liquidityPercentage === 0
                                    }
                                    className="w-full"
                                    variant="destructive"
                                  >
                                    {isLiquidityProcessing ? (
                                      <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Removing Liquidity...
                                      </>
                                    ) : (
                                      `Remove ${liquidityPercentage}% Liquidity`
                                    )}
                                  </Button>
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>
        </Tabs>
    </>
  );
}
