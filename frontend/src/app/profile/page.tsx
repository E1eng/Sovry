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
import {
  getTokenBalance,
  type TokenBalance,
  getClaimableRoyaltyForIp,
} from "@/services/storyProtocolService";
import { enrichLaunchesData } from "@/services/launchDataService";
import { launchpadService } from "@/services/launchpadService";

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
  ipId?: string;
}

interface WrapperToken {
  id: string;
  creator: string;
  launchTime: number;
  graduated: boolean;
}

const SUBGRAPH_URL_RAW = process.env.NEXT_PUBLIC_SUBGRAPH_URL;
if (!SUBGRAPH_URL_RAW) {
  throw new Error('NEXT_PUBLIC_SUBGRAPH_URL is required but not set in environment variables');
}
const SUBGRAPH_URL: string = SUBGRAPH_URL_RAW;

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
  const [harvestingId, setHarvestingId] = useState<string | null>(null);
  const [harvestError, setHarvestError] = useState<string | null>(null);
  const [premineClaimingId, setPremineClaimingId] = useState<string | null>(null);
  const [premineError, setPremineError] = useState<string | null>(null);
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
              console.error("Error loading claimable royalty for IP", asset.ipId, err);
              return asset;
            }
          }),
        );

        setHoldingAssets(holdings);
        setLaunchedAssets(launchedWithRevenue);
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
      console.error("Error harvesting royalties from profile page:", err);
      setHarvestError(err?.message || "Failed to harvest royalties");
    } finally {
      setHarvestingId(null);
    }
  };

  const handleClaimPremine = async (assetId: string) => {
    if (!primaryWallet) return;

    const asset = launchedAssets.find((a) => a.id === assetId);
    if (!asset) {
      setPremineError("Unknown asset for premine claim");
      return;
    }

    setPremineError(null);
    setPremineClaimingId(assetId);

    try {
      const result = await launchpadService.claimCreatorPremine(asset.id, primaryWallet);

      if (!result.success) {
        setPremineError(result.error || "Failed to claim premine");
        return;
      }

      // We don't know the exact premine amount from the transaction without
      // re-reading on-chain state or the subgraph; for now we simply rely on
      // the next refresh of holdings to reflect the updated balance.
    } catch (err: any) {
      console.error("Error claiming premine from profile page:", err);
      setPremineError(err?.message || "Failed to claim premine");
    } finally {
      setPremineClaimingId(null);
    }
  };

  const displayAddress =
    walletAddress && walletAddress.length > 10
      ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
      : walletAddress || "Unknown address";

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
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(walletAddress);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = walletAddress;
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        textarea.style.top = "0";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }

      setHasCopiedAddress(true);
      window.setTimeout(() => setHasCopiedAddress(false), 1500);
    } catch (err) {
      console.error("Failed to copy address", err);
    }
  };

  return (
    <>
      <section className="mb-4 sm:mb-6 px-2 sm:px-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="relative h-20 w-20 sm:h-24 sm:w-24 md:h-28 md:w-28 rounded-full border-3 border-zinc-900 shadow-xl overflow-hidden bg-zinc-800 flex-shrink-0">
              <Image
                src={profileAvatarUrl || "/Sovry_Logo.png"}
                alt="Profile picture"
                fill
                className="object-cover"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <h1 className="text-lg sm:text-2xl md:text-3xl font-semibold text-zinc-50 tracking-tight">
                {headerName}
              </h1>
              {walletAddress && (
                <div className="inline-flex items-center gap-1.5 text-[10px] sm:text-sm text-zinc-100 font-mono bg-zinc-900/80 border border-sovry-crimson/50 rounded-full px-2 py-0.5 sm:px-3 sm:py-1 mt-1 shadow-sm">
                  <span className="truncate max-w-[120px] sm:max-w-[260px] md:max-w-[420px]">
                    {walletAddress}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyAddress}
                    className="inline-flex items-center gap-1 text-sovry-crimson hover:text-sovry-crimson/80 cursor-pointer"
                    aria-label={hasCopiedAddress ? "Address copied" : "Copy address"}
                  >
                    <Copy className="h-3 w-3 sm:h-3.5 sm:w-3.5" aria-hidden="true" />
                    <span className="hidden sm:inline whitespace-nowrap">
                      {hasCopiedAddress ? "Copied" : "Copy address"}
                    </span>
                  </button>
                </div>
              )}
              <p className="mt-2 text-sm sm:text-lg text-zinc-300 max-w-xl">
                {headerBio}
              </p>
            </div>
          </div>
          <div className="flex justify-start sm:justify-end">
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-3 text-[10px] sm:h-9 sm:px-4 sm:text-sm font-medium"
              onClick={() => setIsProfileDialogOpen(true)}
            >
              Edit profile
            </Button>
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
          <TabsList className="inline-flex w-fit h-auto rounded-lg p-0.5 sm:p-1">
            <TabsTrigger
              value="tokens"
              className="text-[11px] sm:text-sm font-medium px-3 sm:px-4 py-1 sm:py-1.5 rounded-md data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-50 hover:bg-zinc-800/40 hover:text-zinc-100"
            >
              <span className="sm:hidden">Tokens</span>
              <span className="hidden sm:inline">Tokens launched</span>
            </TabsTrigger>
            <TabsTrigger
              value="holdings"
              className="text-[11px] sm:text-sm font-medium px-3 sm:px-4 py-1 sm:py-1.5 rounded-md data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-50 hover:bg-zinc-800/40 hover:text-zinc-100"
            >
              <span className="sm:hidden">Holdings</span>
              <span className="hidden sm:inline">Your holdings</span>
            </TabsTrigger>
          </TabsList>

          {/* My Tokens Tab */}
          <TabsContent value="tokens" className="space-y-6">
            {holdingsLoading ? (
              <div className="py-10 sm:py-16 text-center">
                <Coins className="h-10 w-10 text-sovry-crimson mx-auto mb-4 animate-pulse" />
                <p className="text-zinc-400">Loading your tokens...</p>
              </div>
            ) : (
              <>
                {harvestError && (
                  <p className="text-sm text-red-400">{harvestError}</p>
                )}
                {premineError && (
                  <p className="text-sm text-red-400 mt-1">{premineError}</p>
                )}
                <Card className="bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 rounded-xl">
                  <CardHeader>
                    <CardTitle className="text-base sm:text-lg font-semibold text-zinc-50">
                      Launched Tokens
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-zinc-800">
                            <th className="text-left py-2 px-2 text-[10px] sm:py-2.5 sm:px-3 sm:text-base font-medium text-zinc-400 uppercase tracking-wide">
                              Asset
                            </th>
                            <th className="text-right py-2 px-2 text-[10px] sm:py-2.5 sm:px-3 sm:text-base font-medium text-zinc-400 uppercase tracking-wide">
                              Balance
                            </th>
                            <th className="text-right py-2 px-2 text-[10px] sm:py-2.5 sm:px-3 sm:text-base font-medium text-zinc-400 uppercase tracking-wide">
                              Value
                            </th>
                            <th className="text-right py-2 px-2 text-[10px] sm:py-2.5 sm:px-3 sm:text-base font-medium text-zinc-400 uppercase tracking-wide">
                              Available to Harvest
                            </th>
                            <th className="text-right py-2 px-2 text-[10px] sm:py-2.5 sm:px-3 sm:text-base font-medium text-zinc-400 uppercase tracking-wide">
                              Harvest
                            </th>
                            <th className="text-right py-2 px-2 text-[10px] sm:py-2.5 sm:px-3 sm:text-base font-medium text-zinc-400 uppercase tracking-wide">
                              Premine
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {launchedAssets.length === 0 ? (
                            <tr>
                              <td
                                colSpan={6}
                                className="py-4 px-3 text-center text-xs text-zinc-500"
                              >
                                You haven't launched any tokens yet.
                              </td>
                            </tr>
                          ) : (
                            launchedAssets.map((asset) => (
                              <tr
                                key={asset.id}
                                className="border-b border-zinc-800/50 hover:bg-zinc-800/30"
                              >
                                <td className="py-2 px-2 sm:py-3 sm:px-3">
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 sm:w-10 sm:h-10 bg-zinc-800/30 rounded-lg overflow-hidden border border-zinc-700">
                                      <Image
                                        src={asset.image}
                                        alt={asset.name}
                                        width={40}
                                        height={40}
                                        className="w-full h-full object-cover"
                                      />
                                    </div>
                                    <div>
                                      <p className="text-xs sm:text-base font-medium text-zinc-50">
                                        {asset.symbol}
                                      </p>
                                      <p className="text-[10px] sm:text-sm text-zinc-400">
                                        {asset.name}
                                      </p>
                                    </div>
                                  </div>
                                </td>
                                <td className="text-right py-2 px-2 text-[11px] sm:py-4 sm:px-4 sm:text-base text-zinc-50">
                                  {asset.balance.toFixed(2)}
                                </td>
                                <td className="text-right py-2 px-2 text-[11px] sm:py-4 sm:px-4 sm:text-base text-zinc-50">
                                  {new Intl.NumberFormat("en-US", {
                                    style: "currency",
                                    currency: "USD",
                                  }).format(asset.valueUSD)}
                                </td>
                                <td className="text-right py-2 px-2 sm:py-4 sm:px-4">
                                  {asset.claimableRevenue > 0 ? (
                                    <span className="inline-flex items-center gap-1 bg-sovry-crimson/25 text-sovry-crimson px-2.5 py-0.5 rounded-full text-[10px] sm:text-sm font-medium border border-sovry-crimson/40">
                                      {asset.claimableRevenue.toLocaleString("en-US", {
                                        maximumFractionDigits: 4,
                                      })}
                                      <span className="text-[9px] sm:text-[11px] font-normal text-zinc-300 ml-1">
                                        WIP
                                      </span>
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-zinc-500">-</span>
                                  )}
                                </td>
                                <td className="text-right py-2 px-2 sm:py-4 sm:px-4">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-2 text-[10px] sm:h-9 sm:px-4 sm:text-sm font-medium cursor-pointer"
                                    onClick={() => handleHarvestAsset(asset.id)}
                                    disabled={!primaryWallet || harvestingId === asset.id}
                                  >
                                    {harvestingId === asset.id
                                      ? "Harvesting..."
                                      : "Harvest"}
                                  </Button>
                                </td>
                                <td className="text-right py-2 px-2 sm:py-4 sm:px-4">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-2 text-[10px] sm:h-9 sm:px-4 sm:text-sm font-medium cursor-pointer"
                                    onClick={() => handleClaimPremine(asset.id)}
                                    disabled={!primaryWallet || premineClaimingId === asset.id}
                                  >
                                    {premineClaimingId === asset.id
                                      ? "Claiming..."
                                      : "Claim premine"}
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
                <Coins className="h-10 w-10 text-sovry-crimson mx-auto mb-4 animate-pulse" />
                <p className="text-zinc-400">Loading your holdings...</p>
              </div>
            ) : (
              <Card className="bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 rounded-xl">
                <CardHeader>
                  <CardTitle className="text-base sm:text-lg font-semibold text-zinc-50">
                    Holdings
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-zinc-800">
                          <th className="text-left py-2 px-2 text-[10px] sm:py-4 sm:px-4 sm:text-base font-medium text-zinc-400 uppercase tracking-wide">
                            Asset
                          </th>
                          <th className="text-right py-2 px-2 text-[10px] sm:py-4 sm:px-4 sm:text-base font-medium text-zinc-400 uppercase tracking-wide">
                            Balance
                          </th>
                          <th className="text-right py-2 px-2 text-[10px] sm:py-4 sm:px-4 sm:text-base font-medium text-zinc-400 uppercase tracking-wide">
                            Value
                          </th>
                          <th className="text-right py-2 px-2 text-[10px] sm:py-4 sm:px-4 sm:text-base font-medium text-zinc-400 uppercase tracking-wide">
                            Trade
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {holdingAssets.length === 0 ? (
                          <tr>
                            <td
                              colSpan={4}
                              className="py-4 px-3 text-center text-xs text-zinc-500"
                            >
                              You don't hold any assets yet.
                            </td>
                          </tr>
                        ) : (
                          holdingAssets.map((asset) => (
                            <tr
                              key={asset.id}
                              className="border-b border-zinc-800/50 hover:bg-zinc-800/30"
                            >
                              <td className="py-2 px-2 sm:py-4 sm:px-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 sm:w-10 sm:h-10 bg-zinc-800/30 rounded-lg overflow-hidden border border-zinc-700">
                                    <Image
                                      src={asset.image}
                                      alt={asset.name}
                                      width={40}
                                      height={40}
                                      className="w-full h-full object-cover"
                                    />
                                  </div>
                                  <div>
                                    <p className="text-xs sm:text-base font-medium text-zinc-50">
                                      {asset.symbol}
                                    </p>
                                    <p className="text-[10px] sm:text-sm text-zinc-400">
                                      {asset.name}
                                    </p>
                                  </div>
                                </div>
                              </td>
                              <td className="text-right py-2 px-2 text-[11px] sm:py-4 sm:px-4 sm:text-base text-zinc-50">
                                {asset.balance.toFixed(2)}
                              </td>
                              <td className="text-right py-2 px-2 text-[11px] sm:py-4 sm:px-4 sm:text-base text-zinc-50">
                                {new Intl.NumberFormat("en-US", {
                                  style: "currency",
                                  currency: "USD",
                                }).format(asset.valueUSD)}
                              </td>
                              <td className="text-right py-2 px-2 sm:py-4 sm:px-4">
                                <Link href={`/pool/${asset.id}`}>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-2 text-[10px] sm:h-9 sm:px-4 sm:text-sm font-medium cursor-pointer"
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