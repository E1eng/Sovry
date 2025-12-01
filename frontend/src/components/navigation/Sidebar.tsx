"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { LayoutGrid, Coins, User, PlusCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { SovrySymbol } from "@/components/ui/SovrySymbol";

const NAV_ITEMS = [
  { label: "Home", href: "/", icon: LayoutGrid },
  { label: "Create", href: "/create", icon: PlusCircle },
  { label: "Bridge", href: "/bridge", icon: Coins },
  { label: "Profile", href: "/profile", icon: User },
];

export function Sidebar() {
  const pathname = usePathname();
  const { primaryWallet } = useDynamicContext();

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-16 hover:w-64 flex-col bg-black/50 backdrop-blur-md border-r border-border transition-[width] duration-200 group">
      <div className="flex h-full flex-col py-4 w-full">
        {/* Logo */}
        <div className="px-3 mb-6">
          <Link href="/" className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-black/40 backdrop-blur-sm border border-zinc-800/50 flex items-center justify-center shadow-inner flex-shrink-0">
              <SovrySymbol size={24} className="text-foreground" />
            </div>
            <div className="flex flex-col overflow-hidden">
              <span className="text-foreground font-semibold leading-tight text-sm whitespace-nowrap">
                Sovry
              </span>
              <span className="text-[10px] text-muted-foreground tracking-wide whitespace-nowrap">
                IP Markets
              </span>
            </div>
          </Link>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 space-y-1 px-2">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-card/50 hover:text-foreground"
                )}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                <span className="whitespace-nowrap text-sm opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity duration-200">
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* Wallet summary (aligned with nav items) */}
        <div className="mt-auto border-t border-border px-3 pt-4 pb-2 flex flex-col gap-3">
          {primaryWallet && (
            <div className="flex items-center gap-3 mb-1">
              {/* Icon bubble always visible, like nav icons */}
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary via-amber-400 to-primary/80 text-xs font-bold text-background flex-shrink-0">
                {primaryWallet.address?.slice(2, 4).toUpperCase()}
              </div>
              {/* Text fades in when sidebar expands (group-hover), same as nav labels */}
              <div className="flex flex-col min-w-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                <span className="text-xs font-medium">Wallet</span>
                <span className="truncate text-[11px] text-muted-foreground">
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
