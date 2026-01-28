"use client";

import { useEffect, useMemo, useState } from "react";
import { formatEther, type Address } from "viem";
import { useReadContracts } from "wagmi";
import { supabase } from "@/lib/supabaseClient";
import { SOVRY_EXCHANGE_ADDRESS } from "@/services/storyProtocolService";
import { cn } from "@/lib/utils";

const EXCHANGE_ADDRESS = (process.env.NEXT_PUBLIC_EXCHANGE_ADDRESS || SOVRY_EXCHANGE_ADDRESS) as Address | undefined;

const EXCHANGE_ABI = [
  {
    type: "function",
    name: "royaltyWorkflows",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "royaltyModule", type: "address" }],
  },
  {
    type: "function",
    name: "launchedTokens",
    stateMutability: "view",
    inputs: [{ name: "wrapper", type: "address" }],
    outputs: [
      {
        components: [
          { name: "creator", type: "address" },
          { name: "ipAsset", type: "address" },
          { name: "rtAddress", type: "address" },
          { name: "vaultAddress", type: "address" },
          { name: "initialCurveSupply", type: "uint256" },
          { name: "dexReserve", type: "uint256" },
          { name: "graduated", type: "bool" },
        ],
        name: "token",
        type: "tuple",
      },
    ],
  },
] as const;

const ROYALTY_MODULE_ABI = [
  {
    type: "function",
    name: "unclaimedRevenue",
    stateMutability: "view",
    inputs: [
      { name: "ipAsset", type: "address" },
      { name: "recipient", type: "address" },
    ],
    outputs: [{ name: "amount", type: "uint256" }],
  },
] as const;

type RevenueEvent = {
  tx_hash: string;
  amount: string;
  type: string;
  created_at?: string;
};

type TokenRow = {
  total_harvested_amount?: string | null;
};

interface Props {
  wrapperAddress: string;
  className?: string;
}

export function TokenRevenueStats({ wrapperAddress, className }: Props) {
  const [totalHarvested, setTotalHarvested] = useState<string | null>(null);
  const [recentEvents, setRecentEvents] = useState<RevenueEvent[]>([]);

  // Fetch Supabase data client-side
  useEffect(() => {
    let cancelled = false;
    async function loadSupabase() {
      if (!supabase || !wrapperAddress) return;
      const [tokensRes, eventsRes] = await Promise.all([
        supabase.from("tokens").select("total_harvested_amount").eq("token_address", wrapperAddress).limit(1),
        supabase
          .from("revenue_events")
          .select("tx_hash, amount, type, created_at")
          .eq("token_address", wrapperAddress)
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

      if (!cancelled) {
        if (!tokensRes.error && tokensRes.data && tokensRes.data.length > 0) {
          const row = tokensRes.data[0] as TokenRow;
          setTotalHarvested(row.total_harvested_amount ?? null);
        }
        if (!eventsRes.error && Array.isArray(eventsRes.data)) {
          setRecentEvents(eventsRes.data as RevenueEvent[]);
        }
      }
    }
    loadSupabase();
    return () => {
      cancelled = true;
    };
  }, [wrapperAddress]);

  // Read royalty module + ipAsset, then unclaimed revenue
  const exchangeCalls = useMemo(() => {
    if (!EXCHANGE_ADDRESS || !wrapperAddress) return [];
    return [
      { address: EXCHANGE_ADDRESS, abi: EXCHANGE_ABI, functionName: "royaltyWorkflows" as const },
      { address: EXCHANGE_ADDRESS, abi: EXCHANGE_ABI, functionName: "launchedTokens" as const, args: [wrapperAddress as Address] },
    ];
  }, [wrapperAddress]);

  const { data: exchangeData } = useReadContracts({
    allowFailure: true,
    contracts: exchangeCalls,
    query: { enabled: exchangeCalls.length === 2, staleTime: 15_000 },
  });

  const royaltyModuleAddr = useMemo(() => {
    const mod = exchangeData?.[0]?.result as string | undefined;
    return mod && mod !== "0x0000000000000000000000000000000000000000" ? (mod as Address) : undefined;
  }, [exchangeData]);

  const ipAssetAddr = useMemo(() => {
    const tokenTuple = exchangeData?.[1]?.result as any;
    const ip = tokenTuple?.ipAsset as string | undefined;
    return ip && ip !== "0x0000000000000000000000000000000000000000" ? (ip as Address) : undefined;
  }, [exchangeData]);

  const unclaimedCall = useMemo(() => {
    if (!royaltyModuleAddr || !ipAssetAddr || !EXCHANGE_ADDRESS) return [];
    return [
      {
        address: royaltyModuleAddr,
        abi: ROYALTY_MODULE_ABI,
        functionName: "unclaimedRevenue" as const,
        args: [ipAssetAddr, EXCHANGE_ADDRESS],
      },
    ];
  }, [royaltyModuleAddr, ipAssetAddr]);

  const { data: unclaimedData } = useReadContracts({
    allowFailure: true,
    contracts: unclaimedCall,
    query: { enabled: unclaimedCall.length === 1, staleTime: 15_000 },
  });

  const unclaimed = useMemo(() => {
    const val = unclaimedData?.[0]?.result as bigint | undefined;
    return val ?? 0n;
  }, [unclaimedData]);

  const totalHarvestedEth = totalHarvested ? formatEther(BigInt(totalHarvested)) : "0";
  const unclaimedEth = formatEther(unclaimed);
  const status = unclaimed > 0n ? "ACCUMULATING" : "HARVESTED";
  const statusColor = unclaimed > 0n ? "text-[#CCFF00]" : "text-gray-300";

  return (
    <div
      className={cn(
        "rounded-xl border border-neutral-800 bg-black/70 p-4 text-sm text-white shadow-[0_0_30px_rgba(204,255,0,0.15)]",
        "font-mono",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs uppercase tracking-[0.2em] text-neutral-400">Real Yield</div>
        <div
          className={cn(
            "flex items-center gap-2 rounded-full border border-neutral-700 px-3 py-1 text-[11px] font-semibold",
            unclaimed > 0n ? "bg-neutral-900" : "bg-neutral-800",
          )}
        >
          <span className={unclaimed > 0n ? "animate-pulse" : ""}>{unclaimed > 0n ? "🟢" : "⚪️"}</span>
          <span className={statusColor}>{status}</span>
          <span className="text-neutral-500">{unclaimedEth} ETH</span>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        <div className="text-neutral-400 text-xs">TOTAL YIELD GENERATED</div>
        <div className="text-2xl font-semibold text-[#CCFF00]">Ξ {totalHarvestedEth}</div>
      </div>

      <div className="mt-4">
        <div className="text-xs uppercase tracking-[0.2em] text-neutral-500 mb-2">Recent Revenue Events</div>
        <div className="space-y-1 rounded-lg border border-neutral-800 bg-neutral-950/70 p-3">
          {recentEvents.length === 0 && <div className="text-neutral-600 text-xs">No events yet</div>}
          {recentEvents.map((evt) => {
            const amt = formatEther(BigInt(evt.amount || 0));
            return (
              <div
                key={evt.tx_hash}
                className="flex items-center justify-between text-xs text-neutral-200 border-b border-neutral-900 last:border-b-0 pb-1 last:pb-0"
              >
                <span className="text-[#CCFF00] font-semibold">{evt.type || "REVENUE"}</span>
                <span className="text-neutral-400">{amt} ETH</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
