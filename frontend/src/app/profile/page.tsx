"use client";

import { useState, useEffect } from "react";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { useSearchParams } from "next/navigation";
import Image from "next/image";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import UserProfile from "@/components/social/UserProfile";
import { supabase } from "@/lib/supabaseClient";

import { TrendingUp, Coins, Copy } from "lucide-react";

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

export default function ProfilePage() {
  const { primaryWallet } = useDynamicContext();
  const walletAddress = primaryWallet?.address;

  const searchParams = useSearchParams();
  const initialTab =
    (searchParams.get("tab") as "tokens" | "holdings") || "tokens";

  // Holdings state
  const [assets, setAssets] = useState<PortfolioAsset[]>([]);
  const [holdingsLoading, setHoldingsLoading] = useState(true);

  const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false);
  const [profileUsername, setProfileUsername] = useState<string | null>(null);
  const [profileBio, setProfileBio] = useState<string | null>(null);

  // Load holdings (mock - for hackathon demo)
  useEffect(() => {
    const loadHoldings = async () => {
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

  useEffect(() => {
    const loadProfileHeader = async () => {
      if (!walletAddress || !supabase) return;
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("username, bio")
          .eq("wallet_address", walletAddress.toLowerCase())
          .maybeSingle();

        if (error) {
          console.warn("Failed to load profile header", error);
          return;
        }

        if (data && typeof data.username === "string") {
          setProfileUsername(data.username);
        } else {
          setProfileUsername(null);
        }

        if (data && typeof data.bio === "string") {
          setProfileBio(data.bio);
        } else {
          setProfileBio(null);
        }
      } catch (err) {
        console.warn("Failed to load profile header", err);
      }
    };

    loadProfileHeader();
  }, [walletAddress]);

  const handleHarvestAsset = (assetId: string) => {
    setAssets((prev) =>
      prev.map((asset) =>
        asset.id === assetId ? { ...asset, claimableRevenue: 0 } : asset
      )
    );
  };

  const displayAddress =
    walletAddress && walletAddress.length > 8
      ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`
      : walletAddress || "Your wallet";

  const headerName = profileUsername && profileUsername.trim().length > 0
    ? profileUsername.trim()
    : displayAddress;

  const headerBio = profileBio && profileBio.trim().length > 0
    ? profileBio.trim()
    : "no bio yet.";

  const handleCopyAddress = async () => {
    if (!walletAddress) return;
    try {
      await navigator.clipboard.writeText(walletAddress);
    } catch (err) {
      console.error("Failed to copy address", err);
    }
  };

  return (
    <>
      <section className="mb-6 px-2 sm:px-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="relative h-20 w-20 sm:h-24 sm:w-24 md:h-28 md:w-28 rounded-full border-4 border-zinc-900 shadow-xl overflow-hidden bg-zinc-800">
              <Image
                src="/profile-logos/515591D7-FD6F-4C0B-B5F6-AEB092D452F1.png"
                alt="Profile picture"
                fill
                className="object-cover"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold text-zinc-50 tracking-tight">
                {headerName}
              </h1>
              {walletAddress && (
                <div className="inline-flex items-center gap-2 text-[11px] sm:text-xs text-zinc-300 font-mono bg-zinc-900/70 border border-zinc-800 rounded-full px-3 py-1 mt-0.5">
                  <span className="truncate max-w-[160px] sm:max-w-[260px]">
                    {walletAddress}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyAddress}
                    className="inline-flex items-center gap-1 text-[10px] sm:text-[11px] text-zinc-300 hover:text-zinc-100"
                  >
                    <Copy className="h-3 w-3" />
                    <span>Copy</span>
                  </button>
                </div>
              )}
              <p className="mt-2 text-sm sm:text-base text-zinc-300 max-w-xl">
                {headerBio}
              </p>
            </div>
          </div>
          <div className="flex justify-start sm:justify-end">
            <Button
              size="sm"
              variant="outline"
              className="text-xs sm:text-sm"
              onClick={() => setIsProfileDialogOpen(true)}
            >
              Edit Profile
            </Button>
          </div>
        </div>
      </section>

      <Dialog open={isProfileDialogOpen} onOpenChange={setIsProfileDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Profile Settings</DialogTitle>
            <DialogDescription>
              Edit and customize your user profile
            </DialogDescription>
          </DialogHeader>

              <UserProfile onClose={() => setIsProfileDialogOpen(false)} />
            </DialogContent>
          </Dialog>

          <Tabs defaultValue={initialTab} className="space-y-6">
            <TabsList>
              <TabsTrigger value="tokens">My Tokens</TabsTrigger>
              <TabsTrigger value="holdings">Holding</TabsTrigger>
            </TabsList>

            {/* My Tokens Tab */}
            <TabsContent value="tokens" className="space-y-6">
              {holdingsLoading ? (
                <div className="py-16 text-center">
                  <Coins className="h-10 w-10 text-sovry-crimson mx-auto mb-4 animate-pulse" />
                  <p className="text-zinc-400">Loading your holdings...</p>
                </div>
              ) : (
                <>
                  <Card className="bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 rounded-xl">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg font-semibold text-zinc-50">
                        <TrendingUp className="h-5 w-5 text-sovry-crimson" />
                        My Tokens
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
                                Harvested
                              </th>
                              <th className="text-right py-3 px-4 text-sm font-medium text-zinc-400 uppercase tracking-wide">
                                Harvest
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
                                  <Button
                                    size="xs"
                                    variant="outline"
                                    className="h-7 px-3 text-[11px]"
                                    onClick={() => handleHarvestAsset(asset.id)}
                                    disabled={asset.claimableRevenue <= 0}
                                  >
                                    Harvest
                                  </Button>
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

            {/* Holding Tab (copy of My Tokens for now) */}
            <TabsContent value="holdings" className="space-y-6">
              <Card className="bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 rounded-xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg font-semibold text-zinc-50">
                    <TrendingUp className="h-5 w-5 text-sovry-crimson" />
                    Holding
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
                            Harvested
                          </th>
                          <th className="text-right py-3 px-4 text-sm font-medium text-zinc-400 uppercase tracking-wide">
                            Harvest
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
                              <Button
                                size="xs"
                                variant="outline"
                                className="h-7 px-3 text-[11px]"
                                onClick={() => handleHarvestAsset(asset.id)}
                                disabled={asset.claimableRevenue <= 0}
                              >
                                Harvest
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      );
    }