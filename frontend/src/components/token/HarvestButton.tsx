"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Coins, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface HarvestButtonProps {
  tokenAddress: string;
  vaultAddress: string | undefined;
  onHarvest: () => void;
  isHarvesting: boolean;
  hasBalance: boolean;
  className?: string;
}

export function HarvestButton({
  tokenAddress,
  vaultAddress,
  onHarvest,
  isHarvesting,
  hasBalance,
  className,
}: HarvestButtonProps) {
  const isDisabled = isHarvesting || !hasBalance || !vaultAddress;

  return (
    <motion.div
      animate={
        hasBalance && !isHarvesting
          ? {
              scale: [1, 1.05, 1],
            }
          : {}
      }
      transition={{
        repeat: Infinity,
        duration: 2,
        ease: "easeInOut",
      }}
      className={cn("inline-block", className)}
    >
      <Button
        onClick={onHarvest}
        disabled={isDisabled}
        variant={hasBalance ? "default" : "outline"}
        size="lg"
        className={cn(
          "w-full font-bold uppercase tracking-wide transition-all",
          hasBalance && !isHarvesting
            ? "bg-gradient-to-r from-yellow-400 via-yellow-500 to-yellow-600 text-black hover:from-yellow-500 hover:via-yellow-600 hover:to-yellow-700 shadow-lg shadow-yellow-500/50"
            : "border-zinc-700 text-zinc-400 hover:border-zinc-600"
        )}
      >
        {isHarvesting ? (
          <>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Harvesting...
          </>
        ) : (
          <>
            <Coins className="mr-2 h-5 w-5" />
            Harvest Royalties
          </>
        )}
      </Button>
    </motion.div>
  );
}

