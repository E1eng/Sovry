"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useWatchContractEvent } from "wagmi";

const EXCHANGE_ADDRESS = process.env.NEXT_PUBLIC_SOVRY_EXCHANGE_ADDRESS as `0x${string}` | undefined;

// Minimal ABI for TokensPurchased event on SovryExchange
const TOKENS_PURCHASED_ABI = [
  {
    type: "event",
    name: "TokensPurchased",
    inputs: [
      { name: "buyer", type: "address", indexed: true },
      { name: "wrapper", type: "address", indexed: true },
      { name: "ethIn", type: "uint256", indexed: false },
      { name: "rtOut", type: "uint256", indexed: false },
      { name: "fee", type: "uint256", indexed: false },
    ],
  },
] as const;

type TradeData = {
  buyer: string;
  wrapper: string;
  ethIn: string;
};

export default function LiveTradeNotification() {
  const [currentTrade, setCurrentTrade] = useState<TradeData | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const enabled = useMemo(() => Boolean(EXCHANGE_ADDRESS), []);

  useWatchContractEvent({
    address: EXCHANGE_ADDRESS,
    abi: TOKENS_PURCHASED_ABI,
    eventName: "TokensPurchased",
    enabled,
    onLogs(logs) {
      if (!logs.length) return;
      const last = logs[logs.length - 1];
      const { buyer, wrapper, ethIn } = last.args as unknown as TradeData;
      setCurrentTrade({
        buyer,
        wrapper,
        ethIn: ethIn?.toString?.() ?? "0",
      });
      setIsVisible(true);

      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setIsVisible(false);
        setCurrentTrade(null);
      }, 5000);
    },
  });

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  if (!currentTrade) return null;

  const amountEth = Number(currentTrade.ethIn) / 1e18;
  const formatted = amountEth.toFixed(4).replace(/\.0+$/, "");

  return (
    <div
      className={`pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center transition-all duration-500 ${
        isVisible ? "translate-y-0 opacity-100" : "-translate-y-6 opacity-0"
      }`}
    >
      <div className="pointer-events-auto rounded-lg border border-[#CCFF00] bg-black/90 px-4 py-3 shadow-2xl shadow-[#CCFF00]/40">
        <p className="text-xs font-mono tracking-widest text-[#CCFF00]">[NEW TRADE DETECTED]</p>
        <p className="text-sm font-semibold text-white">/// $TOKEN BUY /// {formatted} IP</p>
      </div>
    </div>
  );
}
