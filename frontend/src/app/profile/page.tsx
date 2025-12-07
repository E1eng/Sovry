"use client";

import { useState, useEffect } from "react";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";

import Image from "next/image";
import Link from "next/link";

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
import { getTokenBalance, type TokenBalance } from "@/services/storyProtocolService";
import { enrichLaunchesData } from "@/services/launchDataService";

import { Coins, Copy } from "lucide-react";

// ===== Holdings (from Portfolio) =====
interface PortfolioAsset {
  id: string;
  symbol: string;
  name: string;
  image: string;
  balance: number;
  valueUSD: number;
  claimableRevenue: number;
  category: string;
}

interface WrapperToken {
  id: string;
  creator: string;
  launchTime: number;
  graduated: boolean;
}

const SUBGRAPH_URL =
  process.env.NEXT_PUBLIC_SUBGRAPH_URL ||
  "https://api.goldsky.com/api/public/project_cmhxop6ixrx0301qpd4oi5bb4/subgraphs/Sovry-Aeneid/1.0.0/gn";

async function fetchWrapperTokens(first: number = 100, skip: number = 0): Promise<WrapperToken[]> {
  try {
    const query = `
      query GetWrapperTokens($first: Int!, $skip: Int!) {
        wrapperTokens(first: $first, skip: $skip, orderBy: launchTime, orderDirection: desc) {
          id
          creator
          launchTime
          graduated
        }
      }
    `;

    const res = await fetch(SUBGRAPH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables: { first, skip } }),
    });

    if (!res.ok) return [];

    const json = await res.json();
    const raw = json?.data?.wrapperTokens || [];

    return raw.map((l: any) => ({
      id: l.id as string,
      creator: (l.creator as string) || "",
      launchTime: Number(l.launchTime || 0),
      graduated: Boolean(l.graduated),
    }));
  } catch (err) {
    console.error("Error fetching wrapper tokens from subgraph:", err);
    return [];
  }
}

export default function ProfilePage() {
  const { primaryWallet } = useDynamicContext();
  const walletAddress = primaryWallet?.address;

  // Default to the "tokens" tab; we no longer read `tab` from URL query
  const initialTab: "tokens" | "holdings" = "tokens";

  // Holdings state
  const [launchedAssets, setLaunchedAssets] = useState<PortfolioAsset[]>([]);
  const [holdingAssets, setHoldingAssets] = useState<PortfolioAsset[]>([]);
  const [holdingsLoading, setHoldingsLoading] = useState(true);

  const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false);
  const [profileUsername, setProfileUsername] = useState<string | null>(null);
  const [profileBio, setProfileBio] = useState<string | null>(null);
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(null);

  const handleProfileUpdated = (update: {
    username?: string | null;
    bio?: string | null;
    avatarUrl?: string | null;
  }) => {
    if (update.username !== undefined) {
      setProfileUsername(update.username);
    }
    if (update.bio !== undefined) {
      setProfileBio(update.bio);
    }
    if (update.avatarUrl !== undefined) {
      setProfileAvatarUrl(update.avatarUrl);
    }
  };

  // Load launched tokens & holdings from subgraph + on-chain balances
  useEffect(() => {
    const loadHoldings = async () => {
      setHoldingsLoading(true);
      try {
        if (!walletAddress || !primaryWallet) {
          setLaunchedAssets([]);
          setHoldingAssets([]);
          return;
        }

        const userAddress = walletAddress.toLowerCase();

        // Fetch all launched wrapper tokens from subgraph
        const wrapperTokens = await fetchWrapperTokens(100, 0);
        if (!wrapperTokens || wrapperTokens.length === 0) {
          setLaunchedAssets([]);
          setHoldingAssets([]);
          return;
        }

        const wrapperIds = wrapperTokens.map((w) => w.id);
        const enrichedMap = await enrichLaunchesData(wrapperIds);

        // Fetch balances for all wrapper tokens for this user
        const balanceResults = await Promise.all(
          wrapperTokens.map(async (wrapper) => {
            try {
              const balanceInfo: TokenBalance | null = await getTokenBalance(
                userAddress,
                wrapper.id,
              );
              if (!balanceInfo) return null;

              const balanceNum = parseFloat(balanceInfo.balance || "0");
              if (!isFinite(balanceNum) || balanceNum <= 0) return null;

              return { wrapper, balanceInfo, balanceNum };
            } catch (err) {
              console.error(
                "Error loading wrapper token balance",
                wrapper.id,
                err,
              );
              return null;
            }
          }),
        );

        const nonNullBalances = balanceResults.filter(
          (
            r,
          ): r is {
            wrapper: WrapperToken;
            balanceInfo: TokenBalance;
            balanceNum: number;
          } => !!r,
        );

        // Build holdings: all tokens with balance > 0
        const holdings: PortfolioAsset[] = nonNullBalances.map(
          ({ wrapper, balanceInfo, balanceNum }) => {
            const enriched = enrichedMap.get(wrapper.id) || {};
            return {
              id: wrapper.id,
              symbol: balanceInfo.symbol || (enriched.symbol as string) || "RT",
              name:
                (enriched.name as string) ||
                balanceInfo.symbol ||
                `Token ${wrapper.id.slice(0, 8)}`,
              image:
                (enriched.imageUrl as string) ||
                "/profile-logos/515591D7-FD6F-4C0B-B5F6-AEB092D452F1.png",
              balance: balanceNum,
              valueUSD: 0,
              claimableRevenue: 0,
              category: (enriched.category as string) || "Launched Token",
            };
          },
        );

        // Launched tokens: all tokens created by this user (regardless of current balance)
        const launched: PortfolioAsset[] = wrapperTokens
          .filter((w) => w.creator?.toLowerCase() === userAddress)
          .map((wrapper) => {
            const enriched = enrichedMap.get(wrapper.id) || {};
            const balanceEntry = nonNullBalances.find(
              (r) => r.wrapper.id === wrapper.id,
            );
            const balanceInfo = balanceEntry?.balanceInfo;
            const balanceNum = balanceEntry?.balanceNum ?? 0;

            return {
              id: wrapper.id,
              symbol:
                balanceInfo?.symbol || (enriched.symbol as string) || "RT",
              name:
                (enriched.name as string) ||
                balanceInfo?.symbol ||
                `Token ${wrapper.id.slice(0, 8)}`,
              image:
                (enriched.imageUrl as string) ||
                "/profile-logos/515591D7-FD6F-4C0B-B5F6-AEB092D452F1.png",
              balance: balanceNum,
              valueUSD: 0,
              claimableRevenue: 0,
              category: (enriched.category as string) || "Launched Token",
            };
          });

        setHoldingAssets(holdings);
        setLaunchedAssets(launched);
      } catch (error) {
        console.error("Error loading holdings from subgraph:", error);
        setLaunchedAssets([]);
        setHoldingAssets([]);
      } finally {
        setHoldingsLoading(false);
      }
    };

    if (!walletAddress || !primaryWallet) {
      setLaunchedAssets([]);
      setHoldingAssets([]);
      setHoldingsLoading(false);
      return;
    }

    loadHoldings();
  }, [walletAddress, primaryWallet]);

  // Load profile header (username, bio, avatar)
  useEffect(() => {
    let cancelled = false;

    const loadProfileHeader = async () => {
      if (!walletAddress || !supabase || cancelled) return;
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("username, bio, avatar_url")
          .eq("wallet_address", walletAddress.toLowerCase())
          .maybeSingle();

        if (cancelled) return;

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

        if (
          data &&
          typeof (data as any).avatar_url === "string" &&
          (data as any).avatar_url.trim().length > 0
        ) {
          setProfileAvatarUrl((data as any).avatar_url as string);
        } else {
          setProfileAvatarUrl(null);
        }
      } catch (err) {
        if (!cancelled) {
          console.warn("Failed to load profile header", err);
        }
      }
    };

    loadProfileHeader();

    return () => {
      cancelled = true;
    };
  }, [walletAddress]);

  const handleHarvestAsset = (assetId: string) => {
    setLaunchedAssets((prev) =>
      prev.map((asset) =>
        asset.id === assetId ? { ...asset, claimableRevenue: 0 } : asset,
      ),
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
                src={profileAvatarUrl || "/profile-logos/515591D7-FD6F-4C0B-B5F6-AEB092D452F1.png"}
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
                <div className="inline-flex items-center gap-2 text-[11px] sm:text-xs text-zinc-100 font-mono bg-zinc-900/80 border border-sovry-crimson/50 rounded-full px-3 py-1 mt-1 shadow-sm">
                  <span className="truncate max-w-[180px] sm:max-w-[300px] md:max-w-[420px]">
                    {walletAddress}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyAddress}
                    className="inline-flex items-center gap-1.5 text-[11px] sm:text-xs text-sovry-crimson hover:text-sovry-crimson/80"
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

          <UserProfile
            onClose={() => setIsProfileDialogOpen(false)}
            onProfileUpdated={handleProfileUpdated}
          />
        </DialogContent>
      </Dialog>

      <Tabs defaultValue={initialTab} className="space-y-6">
        <TabsList>
          <TabsTrigger value="tokens">Launched Tokens</TabsTrigger>
          <TabsTrigger value="holdings">Holding</TabsTrigger>
        </TabsList>

            {/* My Tokens Tab */}
            <TabsContent value="tokens" className="space-y-6">
              {holdingsLoading ? (
                <div className="py-16 text-center">
                  <Coins className="h-10 w-10 text-sovry-crimson mx-auto mb-4 animate-pulse" />
                  <p className="text-zinc-400">Loading your tokens...</p>
                </div>
              ) : (
                <>
                  <Card className="bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 rounded-xl">
                    <CardHeader>
                      <CardTitle className="text-lg font-semibold text-zinc-50">
                        Launched Tokens
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
                                Available to Harvest
                              </th>
                              <th className="text-right py-3 px-4 text-sm font-medium text-zinc-400 uppercase tracking-wide">
                                Harvest
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {launchedAssets.map((asset) => (
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
                                    <span className="inline-flex items-center gap-1 bg-sovry-crimson/25 text-sovry-crimson px-3 py-1 rounded-full text-sm font-medium border border-sovry-crimson/40">
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
                                    size="sm"
                                    variant="outline"
                                    className="h-9 px-4 text-xs font-medium"
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

            {/* Holding Tab */}
            <TabsContent value="holdings" className="space-y-6">
              <Card className="bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 rounded-xl">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold text-zinc-50">
                    Holdings
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
                            Trade
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {holdingAssets.map((asset) => (
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
                              <Link href={`/pool/${asset.id}`}>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-9 px-4 text-xs font-medium"
                                >
                                  Trade
                                </Button>
                              </Link>
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