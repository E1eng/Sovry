"use client";

import { useState, useEffect } from "react";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { ethers } from "ethers";
import { useSearchParams } from "next/navigation";
import Image from "next/image";

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
    id: "template-1",
    symbol: "MEME",
    name: "Dank Meme Token",
    image: "/nft-images/0_1WJiB8mUJKcylomi.jpg",
    balance: 1250.5,
    valueUSD: 1250.0,
    claimableRevenue: 45.8,
    apy: "15.8%",
    category: "Meme",
  },
  {
    id: "template-2",
    symbol: "AIAG",
    name: "AI Agent Protocol",
    image: "/nft-images/045A39D6-3381-473C-A1F1-FD9AE6408087.png",
    balance: 890.25,
    valueUSD: 890.0,
    claimableRevenue: 28.45,
    apy: "12.3%",
    category: "AI Agent",
  },
  {
    id: "template-3",
    symbol: "GAME",
    name: "GameFi Universe",
    image: "/nft-images/65217fd9e31608b8b6814492_-9ojwcB1tqVmdclia_Sx-oevPA3tjR3E4Y4Qtywk7fp90800zZijuZNz7dsIGPdmsNlpnfq3l1ayZSh1qWraCQqpIuIcNpEuRBg9tW96irdFURf6DDqWgjZ2EKAbqng6wgyhmrxb5fPt20yMRrWwpcg.png",
    balance: 2100.0,
    valueUSD: 1560.0,
    claimableRevenue: 67.2,
    apy: "18.2%",
    category: "Gaming",
  },
  {
    id: "template-4",
    symbol: "MUSIC",
    name: "Sound Waves NFT",
    image: "/nft-images/809E1643-B14A-4377-8A71-A17DB8C014C8.png",
    balance: 980.0,
    valueUSD: 980.0,
    claimableRevenue: 32.1,
    apy: "14.5%",
    category: "Music",
  },
  {
    id: "template-5",
    symbol: "ART",
    name: "Digital Canvas",
    image: "/nft-images/Creep.png",
    balance: 2030.0,
    valueUSD: 2030.0,
    claimableRevenue: 89.5,
    apy: "16.2%",
    category: "Art",
  },
  {
    id: "template-6",
    symbol: "MEME2",
    name: "Viral Token",
    image: "/nft-images/NFT-creators-money-meme.jpg",
    balance: 670.0,
    valueUSD: 670.0,
    claimableRevenue: 18.3,
    apy: "10.8%",
    category: "Meme",
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
  const { primaryWallet, setShowAuthFlow } = useDynamicContext();
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

  // Load holdings (mock - for hackathon demo)
  useEffect(() => {
    const loadHoldings = async () => {
      // For hackathon demo, always show placeholder data
      setHoldingsLoading(true);
      try {
        // Simulate loading delay
        await new Promise((resolve) => setTimeout(resolve, 500));
        
        // Always use mock assets for demo
        setAssets(MOCK_ASSETS);
      } catch (error) {
        console.error("Error loading holdings:", error);
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
          <div className="h-40 sm:h-48 md:h-56 w-full rounded-3xl shadow-lg border border-zinc-800 overflow-hidden relative">
            <Image
              src="/nft-images/elijahblds_Create_a_1600900_NFT_Art_2D_render_in_the_Bored_Ap_1ae416d8-4a95-4d9d-9f1a-b8275bff1d1e_1.png"
              alt="Hero banner"
              fill
              className="object-cover"
              priority
            />
          </div>
          <div className="-mt-12 sm:-mt-16 flex flex-col gap-4 md:flex-row md:items-end md:justify-between px-2 sm:px-4">
            <div className="flex items-end gap-4">
              <div className="relative flex h-20 w-20 md:h-24 md:w-24 items-center justify-center rounded-full border-4 border-zinc-950 shadow-xl overflow-hidden">
                <Image
                  src="/profile-logos/515591D7-FD6F-4C0B-B5F6-AEB092D452F1.png"
                  alt="Profile picture"
                  fill
                  className="object-cover"
                />
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
                <div className="text-sm font-semibold text-sovry-crimson">
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
          
          {/* Connect Buttons */}
          <div className="flex flex-wrap gap-3 mt-6 px-2 sm:px-4 items-center">
            <Button
              onClick={() => {
                if (setShowAuthFlow) {
                  setShowAuthFlow(true);
                }
              }}
              className="flex items-center gap-2 bg-zinc-900/80 backdrop-blur-sm border border-zinc-800 hover:border-sovry-crimson/50 hover:bg-zinc-800/90 transition-all duration-300 group"
            >
              <div className="flex items-center gap-1.5">
                {/* Ghost icon */}
                <Image
                  src="/nft-images/4850.sp3ow1.192x192.png"
                  alt="Ghost icon"
                  width={20}
                  height={20}
                  className="w-5 h-5"
                />
                {/* MetaMask icon */}
                <Image
                  src="/nft-images/MetaMask-icon-fox.svg"
                  alt="MetaMask"
                  width={20}
                  height={20}
                  className="w-5 h-5"
                />
              </div>
              <span className="text-sm font-medium text-zinc-50">Connect Wallet</span>
            </Button>
            
            <Button
              onClick={() => {
                // TODO: Implement X (Twitter) OAuth connection
                console.log("Connect X clicked");
              }}
              className="flex items-center gap-2 bg-zinc-900/80 backdrop-blur-sm border border-zinc-800 hover:border-zinc-600 hover:bg-zinc-800/90 transition-all duration-300"
            >
              <Image
                src="/profile-logos/X_logo_2023_(white).svg.png"
                alt="X (Twitter)"
                width={20}
                height={20}
                className="w-5 h-5"
              />
              <span className="text-sm font-medium text-zinc-50">Connect X</span>
            </Button>
            
            <Button
              onClick={() => {
                // TODO: Implement Discord OAuth connection
                console.log("Connect Discord clicked");
              }}
              className="flex items-center gap-2 bg-zinc-900/80 backdrop-blur-sm border border-zinc-800 hover:border-indigo-500/50 hover:bg-zinc-800/90 transition-all duration-300"
            >
              <Image
                src="/profile-logos/discord-white-icon.png"
                alt="Discord"
                width={20}
                height={20}
                className="w-5 h-5"
              />
              <span className="text-sm font-medium text-zinc-50">Connect Discord</span>
            </Button>
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
                <Coins className="h-10 w-10 text-sovry-crimson mx-auto mb-4 animate-pulse" />
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
                  </CardContent>
                </Card>

                {/* Claim All */}
                <Card className="bg-zinc-900/50 backdrop-blur-sm border border-sovry-crimson/30 rounded-xl">
                  <CardContent className="p-6 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Gift className="h-6 w-6 text-sovry-crimson" />
                        <h3 className="text-lg font-semibold text-zinc-50">Available to Claim</h3>
                      </div>
                      <p className="text-2xl font-bold text-sovry-crimson">
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
                      <Alert className="mt-4 border-sovry-crimson/30 bg-sovry-crimson/10">
                        <CheckCircle className="h-4 w-4 text-sovry-crimson" />
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
                      <TrendingUp className="h-5 w-5 text-sovry-crimson" />
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
                                  <span className="inline-flex items-center gap-1 bg-sovry-crimson/25 text-sovry-crimson px-3 py-1 rounded-full text-xs font-medium border border-sovry-crimson/40">
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
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-sovry-crimson/20 text-sovry-crimson border border-sovry-crimson/30">
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
                      <Droplets className="h-5 w-5 text-sovry-crimson" />
                      Your Liquidity Pools
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {poolsLoading ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-6 w-6 animate-spin text-sovry-crimson" />
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
                              className="bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 rounded-xl hover:border-sovry-crimson/50 transition-all duration-300"
                            >
                              <CardContent className="p-5 space-y-4">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <div className="p-2 bg-sovry-crimson/20 rounded-lg border border-sovry-crimson/30">
                                      <Droplets className="h-4 w-4 text-sovry-crimson" />
                                    </div>
                                    <div>
                                      <h3 className="font-semibold text-zinc-50 text-sm">
                                        {pool.token0?.symbol ?? "UNKNOWN"} / {pool.token1?.symbol ?? "UNKNOWN"}
                                      </h3>
                                      <div className="flex items-center gap-2 mt-1">
                                        <span className="w-2 h-2 bg-sovry-crimson rounded-full animate-pulse" />
                                        <span className="text-xs text-sovry-crimson">Active</span>
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
                                    <span className="text-sovry-crimson">
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
                                    <span className="text-sovry-crimson">
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
                                <Droplets className="h-5 w-5 text-sovry-crimson" />
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