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
import { logger } from "@/lib/logger";
import { copyToClipboard, truncateAddress } from "@/lib/utils";
import { fetchSubgraph } from "@/services/subgraph";
import { Coins, Copy, AlertCircle } from "lucide-react";

import {
  getTokenBalance,
  type TokenBalance,
  getClaimableRoyaltyForIp,
} from "@/services/storyProtocolService";

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
  ipId?: string;
}

interface WrapperToken {
  id: string;
  creator: string;
  launchTime: number;
  graduated: boolean;
}

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

    const { ok, json } = await fetchSubgraph(query, { first, skip });

    if (!ok) return [];
    const raw = json?.data?.wrapperTokens || [];

    return raw.map((l: any) => ({
      id: l.id as string,
      creator: (l.creator as string) || "",
      launchTime: Number(l.launchTime || 0),
      graduated: Boolean(l.graduated),
    }));
  } catch (err) {
    logger.error("Error fetching wrapper tokens from subgraph:", err);
    return [];
  }
}

export default function ProfilePage() {
  const { primaryWallet, setShowAuthFlow } = useDynamicContext();
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
  const [harvestingId, setHarvestingId] = useState<string | null>(null);
  const [harvestError, setHarvestError] = useState<string | null>(null);
  const [hasCopiedAddress, setHasCopiedAddress] = useState(false);

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
        const { enrichLaunchesData } = await import("@/services/launchDataService");
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
              logger.error(
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
                "/Sovry_Logo.png",
              balance: balanceNum,
              valueUSD: 0,
              claimableRevenue: 0,
              category: (enriched.category as string) || "Launched Token",
              ipId: enriched.ipId as string | undefined,
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
                "/Sovry_Logo.png",
              balance: balanceNum,
              valueUSD: 0,
              claimableRevenue: 0,
              category: (enriched.category as string) || "Launched Token",
              ipId: enriched.ipId as string | undefined,
            };
          });

        // Enrich launched tokens with real onchain royalty data for the
        // "Available to Harvest" column by reading the WIP balance held in
        // the Story Protocol royalty vault backing each IP.
        const launchedWithRevenue: PortfolioAsset[] = await Promise.all(
          launched.map(async (asset) => {
            if (!asset.ipId || !asset.ipId.startsWith("0x") || asset.ipId.length !== 42) {
              return asset;
            }

            try {
              const claimable = await getClaimableRoyaltyForIp(asset.ipId, primaryWallet);

              return {
                ...asset,
                claimableRevenue: isFinite(claimable) && claimable > 0 ? claimable : 0,
              };
            } catch (err) {
              logger.error("Error loading claimable royalty for IP", asset.ipId, err);
              return asset;
            }
          }),
        );

        setHoldingAssets(holdings);
        setLaunchedAssets(launchedWithRevenue);
      } catch (error) {
        logger.error("Error loading holdings from subgraph:", error);
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
          logger.warn("Failed to load profile header", error);
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
          logger.warn("Failed to load profile header", err);
        }
      }
    };

    loadProfileHeader();

    return () => {
      cancelled = true;
    };
  }, [walletAddress]);

  const handleHarvestAsset = async (assetId: string) => {
    if (!primaryWallet) return;

    const asset = launchedAssets.find((a) => a.id === assetId);
    if (!asset) {
      setHarvestError("Unknown asset for harvest");
      return;
    }

    // Require a valid backing IP ID (IP Account) for this wrapper token. This
    // is the IP that royalties are paid to and must be used when claiming via
    // Story Protocol.
    if (!asset.ipId || !asset.ipId.startsWith("0x") || asset.ipId.length !== 42) {
      setHarvestError("No valid IP ID configured for this token; cannot harvest royalties.");
      return;
    }

    setHarvestError(null);
    setHarvestingId(assetId);

    try {
      const { launchpadService } = await import("@/services/launchpadService");
      const result = await launchpadService.harvestAndPump(asset.ipId, asset.id, primaryWallet);

      if (!result.success) {
        setHarvestError(result.error || "Failed to harvest royalties");
        return;
      }

      setLaunchedAssets((prev) =>
        prev.map((a) =>
          a.id === assetId ? { ...a, claimableRevenue: 0 } : a,
        ),
      );
    } catch (err: any) {
      logger.error("Error harvesting royalties from profile page:", err);
      setHarvestError(err?.message || "Failed to harvest royalties");
    } finally {
      setHarvestingId(null);
    }
  };

  const displayAddress = truncateAddress(walletAddress, { fallback: "Unknown address" });

  const headerName =
    profileUsername && profileUsername.trim().length > 0
      ? profileUsername.trim()
      : displayAddress;

  const headerBio =
    profileBio && profileBio.trim().length > 0
      ? profileBio.trim()
      : "This user has not added a bio yet.";

  const handleCopyAddress = async () => {
    if (!walletAddress) return;

    const success = await copyToClipboard(walletAddress);
    if (success) {
      setHasCopiedAddress(true);
      window.setTimeout(() => setHasCopiedAddress(false), 1500);
      return;
    }

    logger.error("Failed to copy address");
  };

  const isConnected = !!primaryWallet;

  if (!isConnected) {
    return (
      <section className="px-2 sm:px-4">
        <div className="min-h-[calc(100vh-12rem)] flex items-center justify-center">
          <Card className="w-full max-w-xs sm:max-w-sm">
            <CardContent className="p-6 text-center space-y-4">
              <div className="mx-auto w-10 h-10 rounded-sm border border-border bg-muted/40 flex items-center justify-center">
                <AlertCircle className="h-5 w-5 text-secondary" />
              </div>
              <div className="space-y-2">
                <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                  Profile access
                </p>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">Wallet not connected</p>
                  <p className="text-xs text-muted-foreground">Connect your wallet to view your profile.</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full h-10 text-[11px] font-mono uppercase tracking-[0.2em]"
                onClick={() => setShowAuthFlow?.(true)}
              >
                Connect Wallet
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="mb-6 px-2 sm:px-4">
        <div className="flex flex-col gap-4 rounded-sm border border-border bg-card/60 p-4 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="relative h-16 w-16 sm:h-20 sm:w-20 md:h-24 md:w-24 rounded-sm border border-border bg-muted/40 overflow-hidden flex-shrink-0">
                <Image
                  src={profileAvatarUrl || "/Sovry_Logo.png"}
                  alt="Profile picture"
                  fill
                  className="object-cover"
                />
              </div>
              <div className="flex flex-col gap-2">
                <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                  Profile
                </p>
                <div className="space-y-1">
                  <h1 className="text-lg sm:text-2xl md:text-3xl font-semibold text-foreground">
                    {headerName}
                  </h1>
                  {walletAddress && (
                    <div className="inline-flex items-center gap-2 rounded-sm border border-border bg-muted/40 px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                      <span className="truncate max-w-[140px] sm:max-w-[280px] md:max-w-[420px] text-foreground tabular-nums">
                        {walletAddress}
                      </span>
                      <button
                        type="button"
                        onClick={handleCopyAddress}
                        className="inline-flex items-center gap-1 text-primary hover:text-primary/80"
                        aria-label={hasCopiedAddress ? "Address copied" : "Copy address"}
                      >
                        <Copy className="h-3 w-3" aria-hidden="true" />
                        <span className="hidden sm:inline whitespace-nowrap">
                          {hasCopiedAddress ? "Copied" : "Copy"}
                        </span>
                      </button>
                    </div>
                  )}
                </div>
                <p className="text-sm sm:text-base text-muted-foreground max-w-xl">
                  {headerBio}
                </p>
              </div>
            </div>
            <div className="flex justify-start sm:justify-end">
              <Button
                size="sm"
                variant="outline"
                className="h-9 px-4 text-[11px] font-mono uppercase tracking-[0.2em]"
                onClick={() => setIsProfileDialogOpen(true)}
              >
                Edit profile
              </Button>
            </div>
          </div>
        </div>
      </section>

      <Dialog open={isProfileDialogOpen} onOpenChange={setIsProfileDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit your profile</DialogTitle>
            <DialogDescription>
              Update your profile information
            </DialogDescription>
          </DialogHeader>

          <UserProfile
            onClose={() => setIsProfileDialogOpen(false)}
            onProfileUpdated={handleProfileUpdated}
          />
        </DialogContent>
      </Dialog>

      <section className="px-2 sm:px-4">
        <Tabs defaultValue={initialTab} className="space-y-4 sm:space-y-6">
          <TabsList className="inline-flex w-fit h-auto rounded-sm border border-border bg-muted/40 p-1">
            <TabsTrigger
              value="tokens"
              className="text-[10px] sm:text-[11px] font-mono uppercase tracking-[0.2em] px-3 sm:px-4 py-1.5 rounded-sm data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm text-muted-foreground hover:text-foreground"
            >
              <span className="sm:hidden">Tokens</span>
              <span className="hidden sm:inline">Tokens launched</span>
            </TabsTrigger>
            <TabsTrigger
              value="holdings"
              className="text-[10px] sm:text-[11px] font-mono uppercase tracking-[0.2em] px-3 sm:px-4 py-1.5 rounded-sm data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm text-muted-foreground hover:text-foreground"
            >
              <span className="sm:hidden">Holdings</span>
              <span className="hidden sm:inline">Your holdings</span>
            </TabsTrigger>
          </TabsList>

          {/* My Tokens Tab */}
          <TabsContent value="tokens" className="space-y-6">
            {holdingsLoading ? (
              <div className="py-10 sm:py-16 text-center">
                <Coins className="h-10 w-10 text-primary mx-auto mb-4 animate-pulse" />
                <p className="text-sm text-muted-foreground">Loading your tokens...</p>
              </div>
            ) : (
              <>
                {harvestError && (
                  <p className="text-sm text-destructive">{harvestError}</p>
                )}
                <Card className="overflow-hidden">
                  <CardHeader className="border-b border-border bg-muted/40">
                    <CardTitle className="text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground">
                      Launched Tokens
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-muted/30">
                          <tr className="border-b border-border">
                            <th className="text-left py-3 px-3 text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                              Asset
                            </th>
                            <th className="text-right py-3 px-3 text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                              Balance
                            </th>
                            <th className="text-right py-3 px-3 text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                              Value
                            </th>
                            <th className="text-right py-3 px-3 text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                              Harvestable
                            </th>
                            <th className="text-right py-3 px-3 text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                              Action
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {launchedAssets.length === 0 ? (
                            <tr>
                              <td
                                colSpan={5}
                                className="py-6 px-3 text-center text-xs text-muted-foreground"
                              >
                                {`You haven't launched any tokens yet.`}
                              </td>
                            </tr>
                          ) : (
                            launchedAssets.map((asset) => (
                              <tr
                                key={asset.id}
                                className="border-b border-border/60 hover:bg-muted/40"
                              >
                                <td className="py-3 px-3">
                                  <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-sm overflow-hidden border border-border bg-muted/40">
                                      <Image
                                        src={asset.image}
                                        alt={asset.name}
                                        width={40}
                                        height={40}
                                        className="w-full h-full object-cover"
                                      />
                                    </div>
                                    <div>
                                      <p className="text-sm font-semibold text-foreground">
                                        {asset.symbol}
                                      </p>
                                      <p className="text-[11px] text-muted-foreground">
                                        {asset.name}
                                      </p>
                                    </div>
                                  </div>
                                </td>
                                <td className="text-right py-3 px-3 text-sm text-foreground tabular-nums">
                                  {asset.balance.toFixed(2)}
                                </td>
                                <td className="text-right py-3 px-3 text-sm text-foreground tabular-nums">
                                  {new Intl.NumberFormat("en-US", {
                                    style: "currency",
                                    currency: "USD",
                                  }).format(asset.valueUSD)}
                                </td>
                                <td className="text-right py-3 px-3">
                                  {asset.claimableRevenue > 0 ? (
                                    <span className="inline-flex items-center gap-1 rounded-sm border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.2em] text-primary tabular-nums">
                                      {asset.claimableRevenue.toLocaleString("en-US", {
                                        maximumFractionDigits: 4,
                                      })}
                                      <span className="text-[9px] font-normal text-muted-foreground ml-1">
                                        WIP
                                      </span>
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-muted-foreground">-</span>
                                  )}
                                </td>
                                <td className="text-right py-3 px-3">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 px-3 text-[10px] font-mono uppercase tracking-[0.2em]"
                                    onClick={() => handleHarvestAsset(asset.id)}
                                    disabled={!primaryWallet || harvestingId === asset.id}
                                  >
                                    {harvestingId === asset.id
                                      ? "Harvesting..."
                                      : "Harvest"}
                                  </Button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* Holdings Tab */}
          <TabsContent value="holdings" className="space-y-6">
            {holdingsLoading ? (
              <div className="py-10 sm:py-16 text-center">
                <Coins className="h-10 w-10 text-primary mx-auto mb-4 animate-pulse" />
                <p className="text-sm text-muted-foreground">Loading your holdings...</p>
              </div>
            ) : (
              <Card className="overflow-hidden">
                <CardHeader className="border-b border-border bg-muted/40">
                  <CardTitle className="text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground">
                    Holdings
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-muted/30">
                        <tr className="border-b border-border">
                          <th className="text-left py-3 px-3 text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                            Asset
                          </th>
                          <th className="text-right py-3 px-3 text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                            Balance
                          </th>
                          <th className="text-right py-3 px-3 text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                            Value
                          </th>
                          <th className="text-right py-3 px-3 text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                            Trade
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {holdingAssets.length === 0 ? (
                          <tr>
                            <td
                              colSpan={4}
                              className="py-6 px-3 text-center text-xs text-muted-foreground"
                            >
                              {`You don't hold any assets yet.`}
                            </td>
                          </tr>
                        ) : (
                          holdingAssets.map((asset) => (
                            <tr
                              key={asset.id}
                              className="border-b border-border/60 hover:bg-muted/40"
                            >
                              <td className="py-3 px-3">
                                <div className="flex items-center gap-3">
                                  <div className="w-9 h-9 rounded-sm overflow-hidden border border-border bg-muted/40">
                                    <Image
                                      src={asset.image}
                                      alt={asset.name}
                                      width={40}
                                      height={40}
                                      className="w-full h-full object-cover"
                                    />
                                  </div>
                                  <div>
                                    <p className="text-sm font-semibold text-foreground">
                                      {asset.symbol}
                                    </p>
                                    <p className="text-[11px] text-muted-foreground">
                                      {asset.name}
                                    </p>
                                  </div>
                                </div>
                              </td>
                              <td className="text-right py-3 px-3 text-sm text-foreground tabular-nums">
                                {asset.balance.toFixed(2)}
                              </td>
                              <td className="text-right py-3 px-3 text-sm text-foreground tabular-nums">
                                {new Intl.NumberFormat("en-US", {
                                  style: "currency",
                                  currency: "USD",
                                }).format(asset.valueUSD)}
                              </td>
                              <td className="text-right py-3 px-3">
                                <Link href={`/pool/${asset.id}`}>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 px-3 text-[10px] font-mono uppercase tracking-[0.2em]"
                                  >
                                    Trade
                                  </Button>
                                </Link>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </section>
    </>
  );
}