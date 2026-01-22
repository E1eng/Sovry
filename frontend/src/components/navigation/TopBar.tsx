"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { DynamicUserProfile, useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { Wallet } from "lucide-react";

import { SovrySymbol } from "@/components/ui/SovrySymbol";
import { getAddressInitials } from "@/lib/avatarUtils";
import { cn, truncateAddress } from "@/lib/utils";
import { supabase } from "@/lib/supabaseClient";
import { NAV_ITEMS } from "@/components/navigation/navItems";

export function TopBar() {
  const pathname = usePathname();
  const { primaryWallet, setShowAuthFlow, setShowDynamicUserProfile } = useDynamicContext();

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [profileUsername, setProfileUsername] = useState<string | null>(null);

  useEffect(() => {
    if (!primaryWallet?.address || !supabase) {
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
          .eq("wallet_address", primaryWallet.address.toLowerCase())
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
  }, [primaryWallet?.address]);

  const openWalletModal = () => {
    if (primaryWallet) {
      setShowDynamicUserProfile?.(true);
      return;
    }

    setShowAuthFlow?.(true);
  };

  const address = primaryWallet?.address;
  const shortAddress = address ? truncateAddress(address, { separator: "…" }) : null;
  const walletLabel = profileUsername || shortAddress || "Connect Wallet";
  const avatarFallback = (profileUsername?.slice(0, 2) || getAddressInitials(address)).toUpperCase();

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-16 items-center justify-between gap-4 px-4 sm:px-6 max-w-[1600px]">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-3 rounded-sm border border-border bg-card px-2.5 py-1.5 text-foreground transition-colors hover:bg-muted/60"
          >
            <SovrySymbol size={20} className="text-foreground" />
            <span className="text-[11px] font-mono uppercase tracking-[0.2em]">Sovry</span>
          </Link>

          <nav className="hidden md:flex items-center gap-2">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-sm px-3 py-2 text-[11px] font-mono uppercase tracking-[0.2em] transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  )}
                  aria-current={isActive ? "page" : undefined}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <nav className="flex items-center gap-1 md:hidden">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-sm border border-border text-xs transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground border-primary/60"
                      : "bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  )}
                  aria-current={isActive ? "page" : undefined}
                >
                  <Icon className="h-4 w-4" />
                </Link>
              );
            })}
          </nav>

          <button
            type="button"
            onClick={openWalletModal}
            className="flex items-center gap-2 rounded-sm border border-border bg-card px-3 py-2 text-[10px] font-mono uppercase tracking-[0.2em] text-foreground transition-colors hover:bg-muted/60"
            aria-label={primaryWallet ? "Open wallet" : "Connect wallet"}
          >
            {primaryWallet ? (
              <>
                <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-sm border border-border bg-muted/40 text-[10px]">
                  {avatarUrl ? (
                    <Image
                      src={avatarUrl}
                      alt="Profile avatar"
                      width={24}
                      height={24}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="font-semibold">{avatarFallback}</span>
                  )}
                </div>
                <span className="hidden sm:inline tabular-nums">{walletLabel}</span>
                <span className="sm:hidden tabular-nums">{shortAddress || "Wallet"}</span>
              </>
            ) : (
              <>
                <Wallet className="h-4 w-4" />
                <span>Connect</span>
              </>
            )}
          </button>
        </div>
      </div>

      <DynamicUserProfile />
    </header>
  );
}
