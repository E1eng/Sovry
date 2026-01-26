"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowUpRight, Filter, SortDesc } from "lucide-react";

import { useDynamicContext } from "@dynamic-labs/sdk-react-core";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { logger } from "@/lib/logger";
import { formatMarketCapIP, truncateAddress } from "@/lib/utils";
import { supabase } from "@/lib/supabaseClient";
import { getAddressInitials } from "@/lib/avatarUtils";
import { fetchSubgraph } from "@/services/subgraph";
import { getTokenBalance, type TokenBalance } from "@/services/storyProtocolService";
import UserProfile from "@/components/social/UserProfile";

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

  const [launchedAssets, setLaunchedAssets] = useState<PortfolioAsset[]>([]);
  const [holdingAssets, setHoldingAssets] = useState<PortfolioAsset[]>([]);
  const [holdingsLoading, setHoldingsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"inventory" | "creations" | "activity">("inventory");
  const [sortKey, setSortKey] = useState<"balance" | "name">("balance");
  const [statusFilter, setStatusFilter] = useState<"all" | "graduated" | "live">("all");
  const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [profileUsername, setProfileUsername] = useState<string | null>(null);

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

        setHoldingAssets(holdings);
        setLaunchedAssets(launched);
      } catch (error) {
        logger.error("Error loading holdings from subgraph:", error);
        setLaunchedAssets([]);
        setHoldingAssets([]);
      } finally {
        setHoldingsLoading(false);
      }
    };

    loadHoldings();
  }, [walletAddress, primaryWallet]);

  // Load profile avatar/username (reuse logic from TopBar)
  useEffect(() => {
    if (!walletAddress || !supabase) {
      setAvatarUrl(null);
      setProfileUsername(null);
      return;
    }

    let cancelled = false;

    const loadProfileAvatar = async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("avatar_url, username")
          .eq("wallet_address", walletAddress.toLowerCase())
          .maybeSingle();

        if (cancelled) return;

        if (error) {
          setAvatarUrl(null);
          setProfileUsername(null);
          return;
        }

        const url = (data as { avatar_url?: string } | null)?.avatar_url;
        const username = (data as { username?: string } | null)?.username;

        setAvatarUrl(url && url.trim().length > 0 ? url : null);
        setProfileUsername(username && username.trim().length > 0 ? username.trim() : null);
      } catch {
        if (!cancelled) {
          setAvatarUrl(null);
          setProfileUsername(null);
        }
      }
    };

    loadProfileAvatar();

    return () => {
      cancelled = true;
    };
  }, [walletAddress]);

  const displayAddress = truncateAddress(walletAddress, { fallback: "Unknown address" });
  const avatarFallback = (profileUsername?.slice(0, 2) || getAddressInitials(walletAddress)).toUpperCase();
  const displayName = profileUsername || displayAddress || "Profile";

  const handleProfileUpdated = () => {
    setIsProfileDialogOpen(false);
  };

  const isConnected = !!primaryWallet;

  const netWorth = useMemo(() => {
    const total = holdingAssets.reduce((acc, asset) => acc + (Number(asset.valueUSD) || 0), 0);
    return total;
  }, [holdingAssets]);

  const tokensHeldCount = holdingAssets.length;
  const tokensCreatedCount = launchedAssets.length;

  const baseAssets = activeTab === "inventory" ? holdingAssets : launchedAssets;
  const filteredAssets = baseAssets.filter((asset) => {
    if (statusFilter === "graduated") return asset.category?.toLowerCase().includes("graduated");
    if (statusFilter === "live") return !asset.category?.toLowerCase().includes("graduated");
    return true;
  });
  const activeAssets = filteredAssets.sort((a, b) => {
    if (sortKey === "name") return a.name.localeCompare(b.name);
    return (b.balance || 0) - (a.balance || 0);
  });

  if (!isConnected) {
    return (
      <section className="px-4 sm:px-6">
        <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center">
          <Card className="w-full max-w-sm border border-[#262626] bg-black">
            <div className="p-6 space-y-4 text-center text-white">
              <div className="mx-auto w-12 h-12 rounded-sm border border-[#262626] bg-black flex items-center justify-center">
                <AlertCircle className="h-5 w-5 text-white/70" />
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-white/60">Access_Locked</p>
                <p className="text-sm">Connect wallet to view The Ledger.</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full h-10 text-[11px] font-mono uppercase tracking-[0.25em] border-[#262626] text-white"
                onClick={() => setShowAuthFlow?.(true)}
              >
                Connect Wallet
              </Button>
            </div>
          </Card>
        </div>
      </section>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <section className="px-4 sm:px-6 py-6 space-y-6">
        {/* Value Strip with Profile */}
        <div className="border border-[#262626] bg-black p-4 sm:p-6 flex flex-col gap-4 lg:gap-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-full border border-[#262626] bg-black/60 overflow-hidden flex items-center justify-center">
                {avatarUrl ? (
                  <Image src={avatarUrl} alt="Profile avatar" width={56} height={56} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-lg font-semibold text-white/70">{avatarFallback}</span>
                )}
              </div>
              <div className="space-y-1">
                <p className="text-2xl font-bold leading-tight">{displayName}</p>
                <p className="text-sm text-white/60 max-w-xl">{displayAddress}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                className="text-[11px] font-mono uppercase tracking-[0.22em] border-[#262626] text-white"
                onClick={() => setIsProfileDialogOpen(true)}
              >
                Edit Profile
              </Button>
              <Button
                size="sm"
                asChild
                className="bg-[#CCFF00] text-black text-[11px] font-mono uppercase tracking-[0.22em] hover:brightness-110"
              >
                <Link href="/create">Launch IP</Link>
              </Button>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row lg:items-stretch gap-4 lg:gap-6">
            <div className="flex-1 flex flex-col justify-between gap-3">
              <p className="text-[11px] font-mono uppercase tracking-[0.25em] text-white/50">TOTAL_VALUE_USD</p>
              <div className="text-4xl sm:text-5xl font-black leading-none">
                {netWorth > 0
                  ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(netWorth)
                  : "—"}
              </div>
            </div>

            <div className="w-full lg:w-[520px] grid grid-cols-2 md:grid-cols-4 border border-[#262626] divide-x divide-y divide-[#262626] text-[10px] font-mono uppercase tracking-[0.18em] bg-black/60">
              <div className="p-4 flex flex-col gap-1">
                <span className="text-white/50 whitespace-nowrap">Tokens_Held</span>
                <span className="text-lg font-semibold text-white tabular-nums">{tokensHeldCount}</span>
              </div>
              <div className="p-4 flex flex-col gap-1">
                <span className="text-white/50 whitespace-nowrap">Tokens_Created</span>
                <span className="text-lg font-semibold text-white tabular-nums">{tokensCreatedCount}</span>
              </div>
              <div className="p-4 flex flex-col gap-1">
                <span className="text-white/50 whitespace-nowrap">Graduated</span>
                <span className="text-lg font-semibold text-white tabular-nums">{activeAssets.filter((a) => a.category?.toLowerCase().includes("graduated")).length}</span>
              </div>
              <div className="p-4 flex flex-col gap-1">
                <span className="text-white/50 whitespace-nowrap">Live_Curves</span>
                <span className="text-lg font-semibold text-white tabular-nums">{activeAssets.filter((a) => !a.category?.toLowerCase().includes("graduated")).length}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs + Filters */}
        <div className="border-b border-[#262626] flex flex-col gap-4">
          <div className="flex items-center gap-4 text-[11px] sm:text-xs font-mono uppercase tracking-[0.18em] whitespace-nowrap overflow-x-auto">
            {(["inventory", "creations", "activity"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`pb-3 transition-colors ${activeTab === tab ? "text-white border-b border-white" : "text-white/50 hover:text-white"}`}
              >
                {tab === "inventory" ? "[ Inventory ]" : tab === "creations" ? "[ Creations ]" : "[ Activity ]"}
              </button>
            ))}
          </div>
          {activeTab !== "activity" && (
            <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono uppercase tracking-[0.18em] text-white/70">
              <button
                onClick={() => setSortKey(sortKey === "balance" ? "name" : "balance")}
                className="inline-flex items-center gap-1 border border-[#262626] px-3 py-2 bg-black hover:bg-white/5"
              >
                <SortDesc className="h-4 w-4" /> Sort: {sortKey}
              </button>
              <div className="inline-flex items-center gap-1 border border-[#262626] bg-black px-2 py-1">
                <Filter className="h-4 w-4" />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                  className="bg-transparent text-white text-[11px] outline-none"
                >
                  <option value="all" className="bg-black">All</option>
                  <option value="live" className="bg-black">Live</option>
                  <option value="graduated" className="bg-black">Graduated</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Content */}
        {activeTab === "activity" ? (
          <div className="border border-dashed border-[#262626] bg-black/40 p-6 text-center text-xs font-mono uppercase tracking-[0.22em] text-white/60">
            Activity feed coming soon — track buys, sells, and royalty injections.
          </div>
        ) : holdingsLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="h-40 border border-[#262626] bg-black animate-pulse" />
            ))}
          </div>
        ) : activeAssets.length === 0 ? (
          <div className="border border-dashed border-[#262626] bg-black/40 p-6 text-center text-xs font-mono uppercase tracking-[0.25em] text-white/60">
            NO_ASSETS_FOUND :: INITIATE_BONDING_CURVE
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeAssets.map((asset) => (
              <Card key={asset.id} className="border border-[#262626] bg-black/85 p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold uppercase tracking-[0.15em]">{asset.symbol}</div>
                  <div className="text-[11px] text-white/60">{asset.category}</div>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <div className="text-lg font-bold truncate">{asset.name}</div>
                  <div className="text-sm text-white/60 tabular-nums">{asset.balance.toFixed(2)}</div>
                </div>
                <div className="flex items-center justify-between text-xs font-mono uppercase tracking-[0.15em] text-white/60">
                  <span>Value</span>
                  <span>
                    {asset.valueUSD > 0
                      ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(asset.valueUSD)
                      : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs font-mono uppercase tracking-[0.15em] text-white/60">
                  <span>ID</span>
                  <span className="truncate max-w-[180px] text-white">{truncateAddress(asset.id, { start: 6, end: 4, separator: "…", minLength: 10 })}</span>
                </div>
                <div className="flex items-center justify-between text-xs font-mono uppercase tracking-[0.15em] text-white/60">
                  <span>MarketCap</span>
                  <span className="text-white">{formatMarketCapIP(asset.valueUSD || 0)}</span>
                </div>
                <div className="flex justify-between items-center pt-1">
                  <Link
                    href={`/pool/${asset.id}`}
                    className="inline-flex items-center gap-1 text-[11px] font-mono uppercase tracking-[0.2em] text-white hover:text-[#CCFF00]"
                  >
                    View Pool <ArrowUpRight className="h-3 w-3" />
                  </Link>
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                    className="h-8 text-[11px] font-mono uppercase tracking-[0.2em] border-[#262626]"
                  >
                    <Link href={`/pool/${asset.id}`}>Trade</Link>
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <Dialog open={isProfileDialogOpen} onOpenChange={setIsProfileDialogOpen}>
        <DialogContent className="sm:max-w-lg bg-black text-white border border-[#262626]">
          <DialogHeader>
            <DialogTitle className="text-white">Edit Profile</DialogTitle>
            <DialogDescription className="text-white/60">
              Update your Sovry profile metadata.
            </DialogDescription>
          </DialogHeader>

          <UserProfile onClose={() => setIsProfileDialogOpen(false)} onProfileUpdated={handleProfileUpdated} />
        </DialogContent>
      </Dialog>
    </div>
  );
}