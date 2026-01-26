"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle } from "lucide-react";
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
import { truncateAddress } from "@/lib/utils";
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
  const [activeTab, setActiveTab] = useState<"inventory" | "creations">("inventory");
  const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false);

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

  const displayAddress = truncateAddress(walletAddress, { fallback: "Unknown address" });

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

  const activeAssets = activeTab === "inventory" ? holdingAssets : launchedAssets;

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
      <div className="px-4 sm:px-6 pt-6 flex justify-end">
        <Button
          variant="outline"
          size="sm"
          className="text-[11px] font-mono uppercase tracking-[0.25em] border-[#262626] text-white"
          onClick={() => setIsProfileDialogOpen(true)}
        >
          Edit Profile
        </Button>
      </div>
      <section className="px-4 sm:px-6 py-8 space-y-8">
        {/* Value Strip */}
        <div className="border border-[#262626] bg-black p-4 sm:p-6 flex flex-col lg:flex-row lg:items-stretch gap-6">
          <div className="flex-1 flex flex-col justify-between gap-3">
            <p className="text-[11px] font-mono uppercase tracking-[0.25em] text-white/50">TOTAL_VALUE_USD</p>
            <div className="text-5xl sm:text-6xl font-black leading-none">
              {netWorth > 0
                ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(netWorth)
                : "—"}
            </div>
          </div>
          <div className="w-full lg:w-[420px] grid grid-cols-2 grid-rows-2 border border-[#262626] divide-x divide-y divide-[#262626] text-xs font-mono uppercase tracking-[0.2em] bg-black/60">
            <div className="p-4 flex flex-col gap-1">
              <span className="text-white/50">Address</span>
              <span className="text-sm font-semibold text-white break-all">{displayAddress}</span>
            </div>
            <div className="p-4 flex flex-col gap-1">
              <span className="text-white/50">Tokens_Held</span>
              <span className="text-lg font-semibold text-white tabular-nums">{tokensHeldCount}</span>
            </div>
            <div className="p-4 flex flex-col gap-1">
              <span className="text-white/50">Tokens_Created</span>
              <span className="text-lg font-semibold text-white tabular-nums">{tokensCreatedCount}</span>
            </div>
            <div className="p-4 flex flex-col gap-1">
              <span className="text-white/50">Rank</span>
              <span className="text-lg font-semibold text-white">—</span>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="border-b border-[#262626] flex items-center gap-6 text-xs font-mono uppercase tracking-[0.25em]">
          {(["inventory", "creations"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 transition-colors ${activeTab === tab ? "text-white border-b border-white" : "text-white/50 hover:text-white"}`}
            >
              {tab === "inventory" ? "[ Inventory ]" : "[ Creations ]"}
            </button>
          ))}
        </div>

        {/* Asset Grid */}
        <div>
          {holdingsLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div key={idx} className="h-32 border border-[#262626] bg-black animate-pulse" />
              ))}
            </div>
          ) : activeAssets.length === 0 ? (
            <div className="border border-dashed border-[#262626] bg-black/40 p-6 text-center text-xs font-mono uppercase tracking-[0.25em] text-white/60">
              NO_ASSETS_FOUND :: INITIALIZE_LAUNCH_PROTOCOL
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeAssets.map((asset) => (
                <div key={asset.id} className="border border-[#262626] bg-black/80 p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold uppercase tracking-[0.15em]">{asset.symbol}</div>
                    <div className="text-[11px] text-white/60">{asset.category}</div>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <div className="text-xl font-bold">{asset.name}</div>
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
                  <div className="flex justify-end">
                    <Link
                      href={`/pool/${asset.id}`}
                      className="text-[11px] font-mono uppercase tracking-[0.2em] text-white underline-offset-4 hover:underline"
                    >
                      View
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
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