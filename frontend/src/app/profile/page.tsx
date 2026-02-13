"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, BarChart3, Database, Edit3, Globe, LayoutGrid, Loader2, Wallet } from "lucide-react";

import { useDynamicContext } from "@dynamic-labs/sdk-react-core";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fetchSubgraph } from "@/services/subgraph";
import { supabase } from "@/lib/supabaseClient";
import { truncateAddress } from "@/lib/utils";
import UserProfile from "@/components/social/UserProfile";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Holder = {
  id: string;
  balance: string;
  wrapper: {
    id: string;
    creator: string;
    ipAsset: string;
    graduated: boolean;
    launchTime: string;
    totalRoyaltiesHarvested: string;
  };
};

type Wrapper = {
  id: string;
  creator: string;
  ipAsset: string;
  graduated: boolean;
  launchTime: string;
  totalRoyaltiesHarvested: string;
};

type RevenueEvent = {
  id: string;
  amount: string;
  timestamp: string;
  token: { id: string };
};

type TokenMeta = {
  name?: string;
  symbol?: string;
  imageUrl?: string;
};

type UserProfileData = {
  username: string | null;
  bio: string | null;
  avatar_url: string | null;
  twitter_handle: string | null;
  telegram_handle: string | null;
  website_url: string | null;
};

type TabKey = "holdings" | "launches" | "yield";

// ---------------------------------------------------------------------------
// Subgraph fetchers
// ---------------------------------------------------------------------------

async function fetchHoldings(user: string): Promise<Holder[]> {
  const query = `
    query Holdings($user: ID!) {
      holders(where: { user: $user, balance_gt: 0 }, first: 100) {
        id
        balance
        wrapper {
          id
          creator
          ipAsset
          graduated
          launchTime
          totalRoyaltiesHarvested
        }
      }
    }
  `;
  const { ok, json } = await fetchSubgraph(query, { user });
  if (!ok) return [];
  return (json?.data?.holders as Holder[]) || [];
}

async function fetchLaunches(user: string): Promise<Wrapper[]> {
  const query = `
    query MyLaunches($creator: Bytes!) {
      wrapperTokens(where: { creator: $creator }, first: 100) {
        id
        creator
        ipAsset
        graduated
        launchTime
        totalRoyaltiesHarvested
      }
    }
  `;
  const { ok, json } = await fetchSubgraph(query, { creator: user });
  if (!ok) return [];
  return (json?.data?.wrapperTokens as Wrapper[]) || [];
}

async function fetchRevenueEvents(user: string): Promise<RevenueEvent[]> {
  const query = `
    query RevenueByCreator($creator: Bytes!) {
      wrapperTokens(where: { creator: $creator }) {
        id
        revenueEvents(orderBy: timestamp, orderDirection: desc, first: 25) {
          id
          amount
          timestamp
          token { id }
        }
      }
    }
  `;
  const { ok, json } = await fetchSubgraph(query, { creator: user });
  if (!ok) return [];
  const tokens = (json?.data?.wrapperTokens as any[]) || [];
  return tokens.flatMap((t) => (t.revenueEvents || []) as RevenueEvent[]);
}

// ---------------------------------------------------------------------------
// Supabase — fetch user profile
// ---------------------------------------------------------------------------

async function fetchProfile(wallet: string): Promise<UserProfileData | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("username, bio, avatar_url, twitter_handle, telegram_handle, website_url")
      .eq("wallet_address", wallet)
      .maybeSingle();
    if (error || !data) return null;
    return data as UserProfileData;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Supabase enrichment — batch-fetch name/symbol/image for wrapper addresses
// ---------------------------------------------------------------------------

async function fetchTokenMetas(addresses: string[]): Promise<Map<string, TokenMeta>> {
  const map = new Map<string, TokenMeta>();
  if (!supabase || addresses.length === 0) return map;

  try {
    const candidates = addresses.flatMap((a) => [a, a.toLowerCase()]);
    const { data } = await supabase
      .from("tokens")
      .select("token_address, name, symbol, image_uri")
      .in("token_address", candidates);

    if (Array.isArray(data)) {
      for (const row of data) {
        const r = row as any;
        const key = String(r.token_address).toLowerCase();
        map.set(key, {
          name: r.name || undefined,
          symbol: r.symbol || undefined,
          imageUrl: r.image_uri || undefined,
        });
      }
    }
  } catch {
    // Supabase unavailable — degrade gracefully
  }

  return map;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/** Convert raw wei string (18 decimals) to human-readable number */
function fromWei(value: string | number | bigint): number {
  try {
    const str = String(value);
    if (!str || str === "0") return 0;
    // Use BigInt division for precision, then parse remainder
    const big = BigInt(str);
    const whole = big / 10n ** 18n;
    const remainder = big % 10n ** 18n;
    return Number(whole) + Number(remainder) / 1e18;
  } catch {
    return 0;
  }
}

/** Format a human-readable number for display */
function formatAmount(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "0";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  if (value >= 1) return value.toFixed(2);
  if (value >= 0.01) return value.toFixed(4);
  return value.toFixed(6);
}

/** Relative time label */
function timeAgo(unixSeconds: number): string {
  const diff = Math.floor(Date.now() / 1000) - unixSeconds;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(unixSeconds * 1000).toLocaleDateString();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ProfilePage() {
  const { primaryWallet, setShowAuthFlow } = useDynamicContext();
  const address = primaryWallet?.address;

  const [activeTab, setActiveTab] = useState<TabKey>("holdings");
  const [holdings, setHoldings] = useState<Holder[]>([]);
  const [launches, setLaunches] = useState<Wrapper[]>([]);
  const [revenues, setRevenues] = useState<RevenueEvent[]>([]);
  const [tokenMetas, setTokenMetas] = useState<Map<string, TokenMeta>>(new Map());
  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});

  const isConnected = !!address;
  const checksum = address?.toLowerCase() || "";

  const markImageError = useCallback((key: string) => {
    setImageErrors((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
  }, []);

  useEffect(() => {
    const load = async () => {
      if (!checksum) return;
      setLoading(true);
      setError(null);
      try {
        const [h, l, r, prof] = await Promise.all([
          fetchHoldings(checksum),
          fetchLaunches(checksum),
          fetchRevenueEvents(checksum),
          fetchProfile(checksum),
        ]);
        setHoldings(h);
        setLaunches(l);
        setRevenues(r);
        setProfile(prof);

        // Collect all wrapper addresses and enrich from Supabase
        const allAddrs = new Set<string>();
        h.forEach((x) => allAddrs.add(x.wrapper.id));
        l.forEach((x) => allAddrs.add(x.id));
        r.forEach((x) => allAddrs.add(x.token.id));
        const metas = await fetchTokenMetas(Array.from(allAddrs));
        setTokenMetas(metas);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load profile data");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [checksum]);

  const getMeta = useCallback(
    (addr: string): TokenMeta => tokenMetas.get(addr.toLowerCase()) || {},
    [tokenMetas],
  );

  const totalHeld = useMemo(() => holdings.length, [holdings]);
  const totalLaunched = useMemo(() => launches.length, [launches]);
  const totalYield = useMemo(
    () => revenues.reduce((acc, ev) => acc + fromWei(ev.amount || "0"), 0),
    [revenues],
  );

  // -------------------------------------------------------------------------
  // Not connected
  // -------------------------------------------------------------------------

  if (!isConnected) {
    return (
      <section className="px-4 sm:px-6">
        <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center">
          <Card className="w-full max-w-sm border border-[#262626] bg-black">
            <div className="p-6 space-y-4 text-center text-white">
              <div className="mx-auto w-12 h-12 rounded-sm border border-[#262626] bg-black flex items-center justify-center">
                <Wallet className="h-5 w-5 text-white/70" />
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-white/60">Wallet Required</p>
                <p className="text-sm text-white/80">Connect your wallet to view your portfolio, launches, and yield.</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full h-10 text-[11px] font-mono uppercase tracking-[0.25em] border-[#262626] text-white hover:bg-white/5"
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

  // -------------------------------------------------------------------------
  // Connected
  // -------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-background text-foreground">
      <section className="px-4 sm:px-6 py-6 space-y-6">
        {/* Edit Profile Dialog */}
        <Dialog open={showEditProfile} onOpenChange={setShowEditProfile}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Profile</DialogTitle>
            </DialogHeader>
            <UserProfile
              onClose={() => setShowEditProfile(false)}
              onProfileUpdated={(update) => {
                setProfile((prev) => ({
                  username: update.username !== undefined ? update.username ?? null : prev?.username ?? null,
                  bio: update.bio !== undefined ? update.bio ?? null : prev?.bio ?? null,
                  avatar_url: update.avatarUrl !== undefined ? update.avatarUrl ?? null : prev?.avatar_url ?? null,
                  twitter_handle: prev?.twitter_handle ?? null,
                  telegram_handle: prev?.telegram_handle ?? null,
                  website_url: prev?.website_url ?? null,
                }));
              }}
            />
          </DialogContent>
        </Dialog>

        {/* Header */}
        <div className="border border-[#262626] bg-[#050505] rounded-xl overflow-hidden">
          <div className="p-4 sm:p-6 flex flex-col sm:flex-row gap-4 sm:gap-5">
            {/* Profile avatar + info */}
            <div className="flex items-start gap-4 flex-1 min-w-0">
              {/* Avatar */}
              <div className="relative h-16 w-16 sm:h-20 sm:w-20 rounded-sm overflow-hidden border border-[#262626] bg-[radial-gradient(circle_at_30%_20%,#1f1f1f,#080808_70%)] flex-shrink-0">
                {profile?.avatar_url && !imageErrors["profile-avatar"] ? (
                  <Image
                    src={profile.avatar_url}
                    alt={profile.username || "Profile"}
                    fill
                    unoptimized
                    className="object-cover"
                    onError={() => markImageError("profile-avatar")}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <span className="text-lg font-semibold text-muted-foreground">
                      {(profile?.username?.charAt(0) || address?.charAt(2) || "?").toUpperCase()}
                    </span>
                  </div>
                )}
              </div>

              {/* Name + bio + socials */}
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  {profile?.username ? (
                    <h1 className="text-lg sm:text-xl font-semibold truncate">@{profile.username}</h1>
                  ) : (
                    <h1 className="text-lg sm:text-xl font-semibold font-mono">
                      {truncateAddress(address, { start: 6, end: 4, separator: "..." })}
                    </h1>
                  )}
                  <button
                    onClick={() => setShowEditProfile(true)}
                    className="inline-flex items-center gap-1 rounded-sm border border-[#262626] px-2 py-1 text-[10px] font-mono uppercase tracking-[0.15em] text-muted-foreground hover:text-foreground hover:border-[#CCFF00]/40 transition-colors"
                  >
                    <Edit3 className="h-3 w-3" /> Edit
                  </button>
                </div>

                {profile?.username && (
                  <p className="text-[11px] font-mono text-muted-foreground">
                    {truncateAddress(address, { start: 6, end: 4, separator: "..." })}
                  </p>
                )}

                {profile?.bio && (
                  <p className="text-sm text-muted-foreground line-clamp-2">{profile.bio}</p>
                )}

                {/* Social links */}
                {(profile?.twitter_handle || profile?.telegram_handle || profile?.website_url) && (
                  <div className="flex items-center gap-3 pt-1">
                    {profile.twitter_handle && (
                      <a
                        href={`https://x.com/${profile.twitter_handle}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] font-mono text-muted-foreground hover:text-[#CCFF00] transition-colors"
                      >
                        @{profile.twitter_handle}
                      </a>
                    )}
                    {profile.telegram_handle && (
                      <a
                        href={`https://t.me/${profile.telegram_handle}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] font-mono text-muted-foreground hover:text-[#CCFF00] transition-colors"
                      >
                        TG: {profile.telegram_handle}
                      </a>
                    )}
                    {profile.website_url && (
                      <a
                        href={profile.website_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[10px] font-mono text-muted-foreground hover:text-[#CCFF00] transition-colors"
                      >
                        <Globe className="h-3 w-3" /> Website
                      </a>
                    )}
                  </div>
                )}

                {!profile?.username && !profile?.bio && (
                  <button
                    onClick={() => setShowEditProfile(true)}
                    className="text-[11px] text-muted-foreground/60 hover:text-[#CCFF00] transition-colors"
                  >
                    {"Set up your profile \u2192"}
                  </button>
                )}
              </div>
            </div>

            {/* Stats pills */}
            <div className="flex flex-wrap sm:flex-col items-start gap-2">
              <div className="inline-flex items-center gap-1.5 border border-[#262626] rounded-sm px-3 py-2 text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                <LayoutGrid className="h-3.5 w-3.5" />
                <span className="text-foreground font-semibold">{totalHeld}</span> Held
              </div>
              <div className="inline-flex items-center gap-1.5 border border-[#262626] rounded-sm px-3 py-2 text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                <Database className="h-3.5 w-3.5" />
                <span className="text-foreground font-semibold">{totalLaunched}</span> Launched
              </div>
              <div className="inline-flex items-center gap-1.5 border border-[#262626] rounded-sm px-3 py-2 text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                <BarChart3 className="h-3.5 w-3.5" />
                <span className="text-[#CCFF00] font-semibold">{formatAmount(totalYield)}</span> IP Yield
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="border-t border-[#262626] px-3 sm:px-6 flex gap-0 overflow-x-auto scrollbar-none">
            {(["holdings", "launches", "yield"] as TabKey[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 sm:px-4 py-3 min-h-[44px] text-[10px] sm:text-[11px] font-mono uppercase tracking-[0.18em] border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab
                    ? "border-[#CCFF00] text-[#CCFF00]"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab === "holdings" ? "Holdings" : tab === "launches" ? "My Launches" : "Real Yield"}
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="border border-destructive/30 bg-destructive/10 rounded-sm p-3 sm:p-4 text-xs sm:text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading portfolio...
          </div>
        ) : (
          <>
            {/* ============== HOLDINGS TAB ============== */}
            {activeTab === "holdings" && (
              <>
                {holdings.length === 0 ? (
                  <EmptyState label="No holdings yet" sub="Buy tokens on the launchpad to see them here." />
                ) : (
                  <div className="border border-[#262626] bg-[#0A0A0A] rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">
                          <tr className="border-b border-[#262626] bg-[#0d0d0d]">
                            <th className="px-4 py-3 text-left">Token</th>
                            <th className="px-4 py-3 text-right">Balance</th>
                            <th className="px-4 py-3 text-right hidden sm:table-cell">Harvested</th>
                            <th className="px-4 py-3 text-center">Status</th>
                            <th className="px-4 py-3 text-right w-10"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {holdings.map((h) => {
                            const meta = getMeta(h.wrapper.id);
                            const displayName = meta.name || meta.symbol || truncateAddress(h.wrapper.id, { start: 6, end: 4 });
                            const displaySymbol = meta.symbol || truncateAddress(h.wrapper.id, { start: 4, end: 0, stripPrefix: true }).toUpperCase();
                            const balance = fromWei(h.balance);
                            const harvested = fromWei(h.wrapper.totalRoyaltiesHarvested);
                            return (
                              <tr key={h.id} className="border-b border-[#1a1a1a] hover:bg-white/[0.03] transition-colors group">
                                <td className="px-4 py-3">
                                  <Link href={`/pool/${h.wrapper.id}`} className="flex items-center gap-3 group/link">
                                    <TokenAvatar
                                      src={meta.imageUrl}
                                      alt={displayName}
                                      id={h.wrapper.id}
                                      imageErrors={imageErrors}
                                      onError={markImageError}
                                    />
                                    <div className="min-w-0">
                                      <p className="text-sm font-semibold text-foreground truncate group-hover/link:text-[#CCFF00] transition-colors">
                                        {displayName}
                                      </p>
                                      <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                                        {displaySymbol}
                                      </p>
                                    </div>
                                  </Link>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <span className="text-sm font-semibold font-mono tabular-nums">{formatAmount(balance)}</span>
                                </td>
                                <td className="px-4 py-3 text-right hidden sm:table-cell">
                                  <span className="text-xs font-mono tabular-nums text-muted-foreground">
                                    {harvested > 0 ? `${formatAmount(harvested)} IP` : "—"}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <StatusBadge graduated={h.wrapper.graduated} />
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <Link href={`/pool/${h.wrapper.id}`} className="text-muted-foreground hover:text-[#CCFF00] transition-colors">
                                    <ArrowUpRight className="h-4 w-4" />
                                  </Link>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ============== LAUNCHES TAB ============== */}
            {activeTab === "launches" && (
              <>
                {launches.length === 0 ? (
                  <EmptyState label="No launches yet" sub="Create your first IP token on the launchpad." linkHref="/create" linkLabel="Launch Token" />
                ) : (
                  <div className="border border-[#262626] bg-[#0A0A0A] rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">
                          <tr className="border-b border-[#262626] bg-[#0d0d0d]">
                            <th className="px-4 py-3 text-left">Token</th>
                            <th className="px-4 py-3 text-right hidden sm:table-cell">Harvested</th>
                            <th className="px-4 py-3 text-right hidden md:table-cell">Launched</th>
                            <th className="px-4 py-3 text-center">Status</th>
                            <th className="px-4 py-3 text-right w-10"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {launches.map((w) => {
                            const meta = getMeta(w.id);
                            const displayName = meta.name || meta.symbol || truncateAddress(w.id, { start: 6, end: 4 });
                            const displaySymbol = meta.symbol || truncateAddress(w.id, { start: 4, end: 0, stripPrefix: true }).toUpperCase();
                            const harvested = fromWei(w.totalRoyaltiesHarvested);
                            return (
                              <tr key={w.id} className="border-b border-[#1a1a1a] hover:bg-white/[0.03] transition-colors group">
                                <td className="px-4 py-3">
                                  <Link href={`/pool/${w.id}`} className="flex items-center gap-3 group/link">
                                    <TokenAvatar
                                      src={meta.imageUrl}
                                      alt={displayName}
                                      id={w.id}
                                      imageErrors={imageErrors}
                                      onError={markImageError}
                                    />
                                    <div className="min-w-0">
                                      <p className="text-sm font-semibold text-foreground truncate group-hover/link:text-[#CCFF00] transition-colors">
                                        {displayName}
                                      </p>
                                      <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                                        {displaySymbol}
                                      </p>
                                    </div>
                                  </Link>
                                </td>
                                <td className="px-4 py-3 text-right hidden sm:table-cell">
                                  <span className="text-xs font-mono tabular-nums text-muted-foreground">
                                    {harvested > 0 ? `${formatAmount(harvested)} IP` : "—"}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-right hidden md:table-cell">
                                  <span className="text-xs text-muted-foreground">
                                    {timeAgo(Number(w.launchTime))}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <StatusBadge graduated={w.graduated} />
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <Link href={`/pool/${w.id}`} className="text-muted-foreground hover:text-[#CCFF00] transition-colors">
                                    <ArrowUpRight className="h-4 w-4" />
                                  </Link>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ============== YIELD TAB ============== */}
            {activeTab === "yield" && (
              <div className="space-y-4">
                {/* Yield summary card */}
                <div className="border border-[#262626] bg-[#050505] rounded-xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground">Total Royalty Yield</p>
                    <p className="text-3xl font-bold text-[#CCFF00] font-mono tabular-nums">
                      {formatAmount(totalYield)} <span className="text-lg text-muted-foreground">IP</span>
                    </p>
                  </div>
                  <Button asChild size="sm" className="text-[11px] font-mono uppercase tracking-[0.2em] bg-[#CCFF00] text-black hover:brightness-110">
                    <Link href="/create">Launch More</Link>
                  </Button>
                </div>

                {revenues.length === 0 ? (
                  <EmptyState label="No revenue events yet" sub="Royalties from your launched tokens will appear here." />
                ) : (
                  <div className="border border-[#262626] bg-[#0A0A0A] rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">
                          <tr className="border-b border-[#262626] bg-[#0d0d0d]">
                            <th className="px-4 py-3 text-left">Token</th>
                            <th className="px-4 py-3 text-right">Amount</th>
                            <th className="px-4 py-3 text-right hidden sm:table-cell">Time</th>
                            <th className="px-4 py-3 text-right w-10"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {revenues.map((ev) => {
                            const meta = getMeta(ev.token.id);
                            const displayName = meta.name || meta.symbol || truncateAddress(ev.token.id, { start: 6, end: 4 });
                            const amount = fromWei(ev.amount);
                            return (
                              <tr key={ev.id} className="border-b border-[#1a1a1a] hover:bg-white/[0.03] transition-colors">
                                <td className="px-4 py-3">
                                  <Link href={`/pool/${ev.token.id}`} className="flex items-center gap-3 group/link">
                                    <TokenAvatar
                                      src={meta.imageUrl}
                                      alt={displayName}
                                      id={ev.token.id}
                                      imageErrors={imageErrors}
                                      onError={markImageError}
                                    />
                                    <span className="text-sm font-semibold truncate group-hover/link:text-[#CCFF00] transition-colors">
                                      {displayName}
                                    </span>
                                  </Link>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <span className="text-sm font-semibold font-mono tabular-nums text-[#CCFF00]">
                                    +{formatAmount(amount)} IP
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-right hidden sm:table-cell">
                                  <span className="text-xs text-muted-foreground">
                                    {timeAgo(Number(ev.timestamp))}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <Link href={`/pool/${ev.token.id}`} className="text-muted-foreground hover:text-[#CCFF00] transition-colors">
                                    <ArrowUpRight className="h-4 w-4" />
                                  </Link>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TokenAvatar({
  src,
  alt,
  id,
  imageErrors,
  onError,
}: {
  src?: string;
  alt: string;
  id: string;
  imageErrors: Record<string, boolean>;
  onError: (key: string) => void;
}) {
  const hasImage = typeof src === "string" && src.trim().length > 0 && !imageErrors[id];
  return (
    <div className="relative h-10 w-10 rounded-sm overflow-hidden border border-[#262626] bg-[radial-gradient(circle_at_30%_20%,#1f1f1f,#080808_70%)] flex-shrink-0">
      {hasImage ? (
        <Image
          src={src!}
          alt={alt}
          fill
          unoptimized
          className="object-cover"
          onError={() => onError(id)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <span className="text-xs font-semibold text-muted-foreground">
            {alt.charAt(0).toUpperCase()}
          </span>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ graduated }: { graduated: boolean }) {
  return graduated ? (
    <span className="inline-flex items-center gap-1 rounded-sm bg-[#CCFF00]/10 border border-[#CCFF00]/30 px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.15em] text-[#CCFF00]">
      Graduated
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-sm bg-white/5 border border-[#262626] px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.15em] text-muted-foreground">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
      Live
    </span>
  );
}

function EmptyState({
  label,
  sub,
  linkHref,
  linkLabel,
}: {
  label: string;
  sub: string;
  linkHref?: string;
  linkLabel?: string;
}) {
  return (
    <div className="border border-dashed border-[#262626] rounded-xl bg-[#050505] p-6 sm:p-10 flex flex-col items-center justify-center gap-3 text-center">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="text-xs text-muted-foreground/60 max-w-xs">{sub}</p>
      {linkHref && linkLabel && (
        <Button asChild variant="outline" size="sm" className="mt-2 text-[11px] font-mono uppercase tracking-[0.2em] border-[#262626] hover:bg-white/5">
          <Link href={linkHref}>{linkLabel}</Link>
        </Button>
      )}
    </div>
  );
}