"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDynamicContext, DynamicWidget } from "@dynamic-labs/sdk-react-core";
import { Home, PlusCircle, User, Wallet } from "lucide-react";

const NAV_ITEMS = [
  { label: "Home", href: "/", icon: Home },
  { label: "Create", href: "/create", icon: PlusCircle },
];

export function Navigation() {
  const pathname = usePathname();
  const { primaryWallet } = useDynamicContext();

  const getInitials = () => {
    const addr = primaryWallet?.address;
    if (!addr || addr.length < 4) return "U";
    return addr.slice(2, 4).toUpperCase();
  };

  const renderLink = (item: (typeof NAV_ITEMS)[number]) => {
    const isActive = pathname === item.href;
    const Icon = item.icon;

    return (
      <Link
        key={item.href}
        href={item.href}
        className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
          isActive
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:bg-muted/20 hover:text-foreground"
        }`}
      >
        <Icon className="h-5 w-5 flex-shrink-0" />
        <span className="whitespace-nowrap text-sm opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity duration-200">
          {item.label}
        </span>
      </Link>
    );
  };

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-16 hover:w-64 flex-col bg-black/50 backdrop-blur-md text-foreground shadow-xl border-r border-white/10 transition-[width] duration-200 group">
      <div className="flex h-full flex-col py-4 w-full">
        {/* Logo */}
        <div className="px-3 mb-6">
          <Link href="/" className="flex items-center space-x-3">
            <div className="flex flex-col overflow-hidden">
              <span className="text-foreground font-semibold leading-tight text-sm whitespace-nowrap">
                Sovry Launchpad
              </span>
              <span className="text-[10px] text-muted-foreground tracking-wide whitespace-nowrap">
                Story IP Markets
              </span>
            </div>
          </Link>
        </div>

        {/* Desktop Links */}
        <nav className="flex-1 space-y-1 px-2">
          {NAV_ITEMS.map((item) => renderLink(item))}
        </nav>

        {/* Wallet / CTA */}
        <div className="mt-auto border-t border-white/10 px-3 pt-4 pb-2 flex flex-col gap-3">
          {primaryWallet && (
            <Link
              href="/profile"
              className="flex items-center gap-3 rounded-xl px-2 py-1 hover:bg-muted/20 transition-colors"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary via-amber-400 to-primary/80 text-xs font-bold text-background flex-shrink-0">
                {getInitials()}
              </div>
              <div className="flex min-w-0 flex-col">
                <span className="text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-200">Profile</span>
                <span className="truncate text-[11px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  {primaryWallet.address?.slice(0, 6)}…{primaryWallet.address?.slice(-4)}
                </span>
              </div>
            </Link>
          )}
          <div className="w-full">
            <div className="w-full overflow-hidden">
              {/* Collapsed: simple wallet icon button */}
              <div className="flex items-center justify-center w-10 h-10 rounded-xl border border-border/60 bg-card/80 text-muted-foreground group-hover:hidden">
                <Wallet className="h-5 w-5" />
              </div>
              {/* Expanded: full Dynamic widget, only on hover */}
              <div className="hidden group-hover:block w-full">
                <DynamicWidget variant="dropdown" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
