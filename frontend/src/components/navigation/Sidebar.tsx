"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { LayoutGrid, Coins, User, PlusCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { SovrySymbol } from "@/components/ui/SovrySymbol";
import { supabase } from "@/lib/supabaseClient";

export const NAV_ITEMS = [
  { label: "Home", href: "/", icon: LayoutGrid },
  { label: "Create", href: "/create", icon: PlusCircle },
  { label: "Register", href: "/register", icon: PlusCircle },
  { label: "Bridge", href: "/bridge", icon: Coins },
  { label: "Profile", href: "/profile", icon: User },
];

export function Sidebar() {
  const pathname = usePathname();
  const { primaryWallet } = useDynamicContext();

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!primaryWallet?.address || !supabase) {
      setAvatarUrl(null);
      return;
    }

    let cancelled = false;

    const loadProfileAvatar = async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("avatar_url")
          .eq("wallet_address", primaryWallet.address.toLowerCase())
          .maybeSingle();

        if (error) {
          if (!cancelled) {
            setAvatarUrl(null);
          }
          return;
        }

        const url = (data as any)?.avatar_url as string | undefined;
        if (!cancelled) {
          if (url && typeof url === "string" && url.trim().length > 0) {
            setAvatarUrl(url);
          } else {
            setAvatarUrl(null);
          }
        }
      } catch {
        if (!cancelled) {
          setAvatarUrl(null);
        }
      }
    };

    loadProfileAvatar();

    return () => {
      cancelled = true;
    };
  }, [primaryWallet?.address]);

  return (
    <aside className="fixed left-0 top-0 z-40 hidden h-screen w-16 hover:w-64 flex-col bg-black/50 backdrop-blur-md border-r border-zinc-900/70 transition-[width] duration-200 group md:flex">
      <div className="flex h-full flex-col py-5 w-full">
        {/* Logo */}
        <div className="px-0 mb-7">
          <Link
            href="/"
            className="flex items-center rounded-2xl px-3.5 py-1.5 transition-all duration-200 justify-start gap-3.5"
          >
            <div className="h-10 w-10 flex items-center justify-center flex-shrink-0">
              <SovrySymbol size={30} className="text-foreground" />
            </div>
            <div className="flex flex-col overflow-hidden ml-1.5 hidden group-hover:flex">
              <span className="text-foreground font-semibold leading-tight text-base whitespace-nowrap">
                Sovry
              </span>
              <span className="text-xs text-muted-foreground tracking-wide whitespace-nowrap">
                v1.0.0
              </span>
            </div>
          </Link>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 space-y-1.5 px-0">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center rounded-2xl px-3.5 py-2.5 text-[15px] font-semibold transition-all duration-200 justify-start gap-3.5",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-card/50"
                )}
              >
                <div
                  className={cn(
                    "h-10 w-10 flex items-center justify-center flex-shrink-0 rounded-2xl",
                    isActive ? "bg-primary/10 ring-1 ring-primary/60" : ""
                  )}
                >
                  <Icon className="h-6 w-6" />
                </div>
                <span
                  className={cn(
                    "whitespace-nowrap text-[15px] ml-2 hidden group-hover:inline-flex",
                    "opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                  )}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* Wallet summary (aligned with nav items) */}
        <div className="mt-auto border-t border-border px-0 pt-4 pb-3 flex flex-col gap-3">
          {primaryWallet && (
            <div className="flex items-center mb-1 justify-start gap-3.5 px-3.5">
              {/* Icon bubble always visible, like nav icons */}
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary via-amber-400 to-primary/80 text-sm font-bold text-background flex-shrink-0 overflow-hidden">
                {avatarUrl ? (
                  <Image
                    src={avatarUrl}
                    alt="Profile avatar"
                    width={40}
                    height={40}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  primaryWallet.address?.slice(2, 4).toUpperCase()
                )}
              </div>
              {/* Text appears when sidebar expands (group-hover), same as nav labels */}
              <div className="flex flex-col min-w-0 hidden group-hover:flex">
                <span className="text-sm font-medium">Wallet</span>
                <span className="truncate text-xs text-muted-foreground">
                  {primaryWallet.address?.slice(0, 6)}…{primaryWallet.address?.slice(-4)}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
