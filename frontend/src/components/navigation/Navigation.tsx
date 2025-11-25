"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { useDynamicContext, DynamicWidget } from "@dynamic-labs/sdk-react-core";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";

const NAV_ITEMS = [
  { label: "Create / Launch", href: "/create" },
  { label: "Portfolio / Pools", href: "/profile" },
];

export function Navigation() {
  const pathname = usePathname();
  const { primaryWallet, setShowAuthFlow } = useDynamicContext();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const toggleMobile = () => setMobileOpen((open) => !open);
  const closeMobile = () => setMobileOpen(false);

  const renderLink = (item: (typeof NAV_ITEMS)[number], isMobile = false) => {
    const isActive = pathname === item.href;
    const baseClasses = isMobile
      ? "block px-4 py-3 rounded-xl text-base font-medium"
      : "px-3 py-2 rounded-lg text-sm font-medium";

    const activeClasses = isActive
      ? "text-primary bg-primary/10 border border-primary/30"
      : "text-muted-foreground hover:text-foreground hover:bg-muted/20";

    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={isMobile ? closeMobile : undefined}
        className={`${baseClasses} ${activeClasses} transition-all duration-200`}
      >
        {item.label}
      </Link>
    );
  };

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-card/95 border-b border-border/60 shadow-lg shadow-black/30"
          : "bg-card/80 border-b border-border/20"
      } backdrop-blur-xl`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary via-amber-400 to-primary/80 flex items-center justify-center shadow-inner">
              <span className="text-background font-black text-lg">S</span>
            </div>
            <div className="flex flex-col">
              <span className="text-foreground font-semibold leading-tight">Sovry Launchpad</span>
              <span className="text-xs text-muted-foreground tracking-wide">Story IP Markets</span>
            </div>
          </Link>

          {/* Desktop Links */}
          <nav className="hidden md:flex items-center space-x-2">
            {NAV_ITEMS.map((item) => renderLink(item))}
          </nav>

          {/* Wallet / CTA */}
          <div className="flex items-center gap-3">
            <div className="hidden md:block">
              <DynamicWidget variant="dropdown" />
            </div>

            <button
              className="md:hidden inline-flex items-center justify-center rounded-xl border border-border/60 bg-card/80 p-2 text-muted-foreground hover:text-foreground hover:border-border"
              onClick={toggleMobile}
              aria-label="Toggle navigation"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="md:hidden border-t border-border/40 bg-card/95 backdrop-blur-xl">
          <div className="px-4 py-4 space-y-3">
            {NAV_ITEMS.map((item) => renderLink(item, true))}
            <div onClick={closeMobile}>
              <DynamicWidget variant="modal" />
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
