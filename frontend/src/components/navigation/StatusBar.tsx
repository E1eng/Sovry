"use client";

import Link from "next/link";
import { useDynamicContext, DynamicWidget } from "@dynamic-labs/sdk-react-core";
import { ExternalLink } from "lucide-react";

export function StatusBar() {
  const { primaryWallet } = useDynamicContext();

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 h-10 bg-zinc-950/80 backdrop-blur-md border-t border-border flex items-center justify-between px-4">
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        {primaryWallet && (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-primary" />
            <span className="font-mono">
              {primaryWallet.address?.slice(0, 6)}…{primaryWallet.address?.slice(-4)}
            </span>
          </div>
        )}
      </div>
      
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <Link href="/docs" className="hover:text-foreground transition-colors">
          Docs
        </Link>
        <Link href="/terms" className="hover:text-foreground transition-colors">
          Terms
        </Link>
        <Link href="/policy" className="hover:text-foreground transition-colors">
          Policy
        </Link>
        <a
          href="https://discord.gg/sovry"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground transition-colors"
        >
          <ExternalLink className="h-3 w-3" />
        </a>
        <a
          href="https://twitter.com/sovry"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground transition-colors"
        >
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}

