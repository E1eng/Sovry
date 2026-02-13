"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { DynamicUserProfile, useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { Wallet, ChevronDown, User, Settings } from "lucide-react";

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
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!primaryWallet?.address || !supabase) {
      setAvatarUrl(null);
      setProfileUsername(null);
      setShowUserMenu(false);
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

  const address = primaryWallet?.address;
  const shortAddress = address ? truncateAddress(address, { separator: "…" }) : null;
  const avatarFallback = (profileUsername?.slice(0, 2) || getAddressInitials(address)).toUpperCase();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 items-center justify-between gap-3 px-4 sm:px-6 max-w-[1600px]">
        {/* Left: Logo */}
        <Link
          href="/"
          className="flex items-center gap-2.5 text-foreground transition-colors hover:opacity-80 flex-shrink-0"
        >
          <SovrySymbol size={22} className="text-foreground" />
          <span className="hidden sm:inline text-[12px] font-semibold tracking-[0.08em] uppercase">Sovry</span>
        </Link>

        {/* Center: Navigation — desktop */}
        <nav className="hidden md:flex items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-[11px] font-mono uppercase tracking-[0.15em] transition-colors",
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

        {/* Right: Mobile nav + User area */}
        <div className="flex items-center gap-2">
          {/* Mobile nav icons */}
          <nav className="flex items-center gap-1 md:hidden">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-md transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  )}
                  aria-current={isActive ? "page" : undefined}
                >
                  <Icon className="h-4 w-4" />
                </Link>
              );
            })}
          </nav>

          {/* Divider on mobile */}
          {primaryWallet && (
            <div className="h-5 w-px bg-border md:hidden" />
          )}

          {/* User menu */}
          <div className="relative" ref={menuRef}>
            {primaryWallet ? (
              <button
                type="button"
                onClick={() => setShowUserMenu((s) => !s)}
                className={cn(
                  "flex items-center gap-2 rounded-md border border-border px-2 sm:px-3 py-1.5 text-[10px] font-mono uppercase tracking-[0.15em] text-foreground transition-colors hover:bg-muted/60",
                  showUserMenu && "bg-muted/60"
                )}
                aria-label="Open user menu"
                aria-expanded={showUserMenu}
              >
                <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border border-border bg-muted/40 text-[10px] flex-shrink-0">
                  {avatarUrl ? (
                    <Image
                      src={avatarUrl}
                      alt="Avatar"
                      width={24}
                      height={24}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="font-semibold text-[9px]">{avatarFallback}</span>
                  )}
                </div>
                <span className="hidden sm:inline tabular-nums max-w-[100px] truncate">
                  {profileUsername || shortAddress}
                </span>
                <ChevronDown className={cn(
                  "h-3 w-3 text-muted-foreground transition-transform duration-150",
                  showUserMenu && "rotate-180"
                )} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowAuthFlow?.(true)}
                className="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-[10px] font-mono uppercase tracking-[0.15em] text-primary transition-colors hover:bg-primary/20"
                aria-label="Connect wallet"
              >
                <Wallet className="h-4 w-4" />
                <span>Connect</span>
              </button>
            )}

            {/* Dropdown menu */}
            {showUserMenu && primaryWallet && (
              <div className="absolute right-0 top-full mt-2 w-56 rounded-md border border-border bg-card shadow-2xl shadow-black/40 z-50 overflow-hidden">
                {/* User info header */}
                <div className="px-4 py-3 border-b border-border bg-muted/30">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-border bg-muted/40 flex-shrink-0">
                      {avatarUrl ? (
                        <Image
                          src={avatarUrl}
                          alt="Avatar"
                          width={32}
                          height={32}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-xs font-semibold">{avatarFallback}</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      {profileUsername && (
                        <p className="text-xs font-semibold text-foreground truncate">@{profileUsername}</p>
                      )}
                      <p className="text-[10px] font-mono text-muted-foreground tabular-nums">{shortAddress}</p>
                    </div>
                  </div>
                </div>

                {/* Menu items */}
                <div className="py-1">
                  <Link
                    href="/profile"
                    className="flex items-center gap-3 px-4 py-2.5 text-[11px] font-mono uppercase tracking-[0.15em] text-foreground hover:bg-muted/40 transition-colors"
                    onClick={() => setShowUserMenu(false)}
                  >
                    <User className="h-4 w-4 text-muted-foreground" />
                    Profile
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setShowUserMenu(false);
                      setShowDynamicUserProfile?.(true);
                    }}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-[11px] font-mono uppercase tracking-[0.15em] text-foreground hover:bg-muted/40 transition-colors"
                  >
                    <Settings className="h-4 w-4 text-muted-foreground" />
                    Wallet
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <DynamicUserProfile />
    </header>
  );
}
