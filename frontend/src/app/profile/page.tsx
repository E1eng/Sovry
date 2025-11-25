"use client";

import { useState, useEffect } from "react";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { ethers } from "ethers";
import { useSearchParams } from "next/navigation";

import { Navigation } from "@/components/navigation/Navigation";
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-background/95">
      <Navigation />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">
            <span className="bg-gradient-to-r from-primary via-primary/80 to-primary bg-clip-text text-transparent">
              Profile
            </span>
          </h1>
          <p className="text-muted-foreground">
            Your IP holdings, revenue, and liquidity positions in one place.
          </p>
        </div>

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
                <Coins className="h-10 w-10 text-primary mx-auto mb-4 animate-pulse" />
                <p className="text-muted-foreground">Loading your holdings...</p>
              </div>
            ) : (
              <>
                {/* Net Worth */}
                <Card className="glass-card border-primary/30">
                  <CardContent className="p-8 flex items-center justify-between">
                    <div>
                      <p className="text-muted-foreground text-lg mb-2">Net Worth</p>
                      <p className="text-4xl md:text-5xl font-bold text-primary">
                        {new Intl.NumberFormat("en-US", {
                          style: "currency",
                          currency: "USD",
                        }).format(calculateNetWorth())}
                      </p>
                      <p className="text-muted-foreground mt-2">
                        Total value of all your IP assets
                      </p>
                    </div>
                    <DollarSign className="h-16 w-16 text-primary/40" />
                  </CardContent>
                </Card>

                {/* Claim All */}
                <Card className="glass-card border-emerald-500/30">
                  <CardContent className="p-6 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Gift className="h-6 w-6 text-emerald-400" />
                        <h3 className="text-lg font-semibold">Available to Claim</h3>
                      </div>
                      <p className="text-2xl font-bold text-emerald-400">
                        {new Intl.NumberFormat("en-US", {
                          style: "currency",
                          currency: "USD",
                        }).format(calculateTotalClaimable())}
                      </p>
                    </div>
                    <Button
                      onClick={handleClaimAll}
                      disabled={claiming || calculateTotalClaimable() === 0}
                      className="bg-emerald-600 hover:bg-emerald-700 text-black px-8 py-4 text-lg font-bold"
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
                      <Alert className="mt-4 border-emerald-500/30 bg-emerald-500/10">
                        <CheckCircle className="h-4 w-4 text-emerald-400" />
                        <AlertDescription className="text-emerald-300">
                          Successfully claimed rewards at {lastClaimTime.toLocaleTimeString()}
                        </AlertDescription>
                      </Alert>
                    </CardContent>
                  )}
                </Card>

                {/* Assets Table */}
                <Card className="glass-card">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-primary" />
                      My Assets
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-border/30">
                            <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                              Asset
                            </th>
                            <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">
                              Balance
                            </th>
                            <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">
                              Value
                            </th>
                            <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">
                              Claimable Revenue
                            </th>
                            <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">
                              APY
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {assets.map((asset) => (
                            <tr
                              key={asset.id}
                              className="border-b border-border/20 hover:bg-muted/10"
                            >
                              <td className="py-4 px-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 bg-muted/20 rounded-lg overflow-hidden border border-border/30">
                                    <img
                                      src={asset.image}
                                      alt={asset.name}
                                      className="w-full h-full object-cover"
                                    />
                                  </div>
                                  <div>
                                    <p className="font-medium">{asset.symbol}</p>
                                    <p className="text-sm text-muted-foreground">{asset.name}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="text-right py-4 px-4">
                                {asset.balance.toFixed(2)}
                              </td>
                              <td className="text-right py-4 px-4">
                                {new Intl.NumberFormat("en-US", {
                                  style: "currency",
                                  currency: "USD",
                                }).format(asset.valueUSD)}
                              </td>
                              <td className="text-right py-4 px-4">
                                {asset.claimableRevenue > 0 ? (
                                  <span className="apy-badge">
                                    {new Intl.NumberFormat("en-US", {
                                      style: "currency",
                                      currency: "USD",
                                    }).format(asset.claimableRevenue)}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </td>
                              <td className="text-right py-4 px-4">
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-primary/20 text-primary border border-primary/30">
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
                <Card className="glass-card">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Droplets className="h-5 w-5 text-cyan-400" />
                      Your Liquidity Pools
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {poolsLoading ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-6 w-6 animate-spin text-cyan-400" />
                        <span className="ml-3 text-slate-300">Loading your pools...</span>
                      </div>
                    ) : poolsError ? (
                      <Alert variant="destructive">
                        <AlertDescription>{poolsError}</AlertDescription>
                      </Alert>
                    ) : userPools.length === 0 ? (
                      <div className="p-8 text-center text-muted-foreground">
                        You don't have any liquidity positions yet.
                      </div>
                    ) : (
                      <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                          {userPools.map((pool) => (
                            <Card
                              key={pool.id}
                              className="glass-card hover:border-cyan-500/50 transition-all duration-300"
                            >
                              <CardContent className="p-5 space-y-4">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <div className="p-2 bg-cyan-500/20 rounded-lg border border-cyan-500/30">
                                      <Droplets className="h-4 w-4 text-cyan-400" />
                                    </div>
                                    <div>
                                      <h3 className="font-semibold text-white text-sm">
                                        {pool.token0?.symbol ?? "UNKNOWN"} / {pool.token1?.symbol ?? "UNKNOWN"}
                                      </h3>
                                      <div className="flex items-center gap-2 mt-1">
                                        <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                                        <span className="text-xs text-green-400">Active</span>
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                <div className="space-y-2 text-xs text-slate-300">
                                  <div className="flex justify-between">
                                    <span>Reserve 0</span>
                                    <span>{formatNumber(pool.reserve0)}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>Reserve 1</span>
                                    <span>{formatNumber(pool.reserve1)}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>Volume USD</span>
                                    <span className="text-green-400">
                                      ${formatNumber(pool.volumeUSD)}
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>Your LP Balance</span>
                                    <span className="text-cyan-400">
                                      {pool.userLpBalance || "0"} LP
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>Your Share</span>
                                    <span className="text-purple-400">
                                      {pool.userLpPercentage?.toFixed(2) || "0.00"}%
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>Created</span>
                                    <span>{formatDate(pool.createdAtTimestamp)}</span>
                                  </div>
                                </div>

                                <div className="pt-3 border-t border-slate-600/30 space-y-2">
                                  <Button
                                    size="sm"
                                    className="w-full bg-gradient-to-r from-green-600 to-emerald-600"
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
                                    className="w-full border-orange-500/60 text-orange-300"
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
                          <Card className="glass-card border-cyan-500/40">
                            <CardHeader>
                              <CardTitle className="flex items-center gap-2">
                                <Droplets className="h-5 w-5 text-cyan-400" />
                                Manage Liquidity
                                <span className="text-xs text-muted-foreground font-normal">
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
                                      className="w-full h-2 bg-red-200 rounded-lg appearance-none cursor-pointer"
                                    />
                                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                                      <span>0%</span>
                                      <span>25%</span>
                                      <span>50%</span>
                                      <span>75%</span>
                                      <span>100%</span>
                                    </div>
                                  </div>

                                  <div>
                                    <Label>LP Token Amount</Label>
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
      </main>
    </div>
  );
}
