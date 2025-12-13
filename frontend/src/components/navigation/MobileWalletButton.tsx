"use client";

import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { Wallet } from "lucide-react";

export function MobileWalletButton() {
  const { primaryWallet, setShowAuthFlow, setShowDynamicUserProfile } = useDynamicContext();

  const openWalletModal = () => {
    if (primaryWallet) {
      setShowDynamicUserProfile?.(true);
      return;
    }

    setShowAuthFlow?.(true);
  };

  const address = primaryWallet?.address;
  const shortAddress = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : null;

  return (
    <button
      type="button"
      onClick={openWalletModal}
      className="h-10 inline-flex items-center gap-2 rounded-xl bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 px-3 text-xs font-semibold text-zinc-100 hover:bg-zinc-900/70 transition-colors"
      aria-label={primaryWallet ? "Open wallet" : "Connect wallet"}
    >
      <Wallet className="h-4 w-4 text-zinc-200" />
      <span className="hidden sm:inline whitespace-nowrap">
        {primaryWallet ? shortAddress : "Connect Wallet"}
      </span>
    </button>
  );
}
