"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { NAV_ITEMS } from "@/components/navigation/Sidebar";
import { cn } from "@/lib/utils";

export function MobileNavBar() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-zinc-800 bg-black/80 backdrop-blur-lg px-4 py-2 md:hidden">
      {NAV_ITEMS.map((item) => {
        const isActive = pathname === item.href;
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            className="flex flex-col items-center gap-0.5 text-[10px]"
          >
            <div
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-full border text-xs",
                isActive
                  ? "border-sovry-green/60 bg-sovry-green/15 text-sovry-green"
                  : "border-zinc-800 bg-zinc-900/60 text-zinc-400",
              )}
            >
              <Icon className="h-4 w-4" />
            </div>
            <span
              className={cn(
                "text-[10px] font-medium",
                isActive ? "text-sovry-green" : "text-zinc-400",
              )}
            >
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
