"use client"

import { useEffect, useState } from "react"
import { formatEther } from "viem"
import { supabase } from "@/lib/supabaseClient"
import { cn } from "@/lib/utils"

type RevenueEvent = {
  tx_hash: string
  amount: string
  type: string
  created_at?: string
}

interface Props {
  tokenAddress: string
  className?: string
}

export function TokenRevenueStats({ tokenAddress, className }: Props) {
  const [totalHarvested, setTotalHarvested] = useState<string>("0")
  const [recentEvents, setRecentEvents] = useState<RevenueEvent[]>([])
  const [unclaimed, setUnclaimed] = useState<bigint>(0n)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!tokenAddress) return

      const [tokenRes, eventsRes] = await Promise.all([
        supabase.from("tokens").select("total_harvested_amount, unclaimed_amount").eq("address", tokenAddress).single(),
        supabase
          .from("revenue_events")
          .select("tx_hash, amount, type, created_at")
          .eq("token_address", tokenAddress)
          .order("created_at", { ascending: false })
          .limit(3),
      ])

      if (cancelled) return

      if (!tokenRes.error && tokenRes.data) {
        const harvested = tokenRes.data.total_harvested_amount ?? "0"
        const unclaimedAmt = tokenRes.data.unclaimed_amount ?? "0"
        setTotalHarvested(harvested)
        setUnclaimed(BigInt(unclaimedAmt))
      }

      if (!eventsRes.error && Array.isArray(eventsRes.data)) {
        setRecentEvents(eventsRes.data as RevenueEvent[])
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [tokenAddress])

  const totalYieldEth = formatEther(BigInt(totalHarvested || "0"))
  const status = unclaimed > 0n ? "ACCUMULATING" : "HARVESTED"

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
        <div className="flex items-center gap-2 rounded-full border border-neutral-700 px-3 py-1 text-[11px] font-semibold bg-neutral-900">
          <span className={unclaimed > 0n ? "animate-pulse" : ""}>{unclaimed > 0n ? "🟢" : "⚪️"}</span>
          <span className={unclaimed > 0n ? "text-[#CCFF00]" : "text-gray-300"}>Vault Status: {status}</span>
        </div>
      </div>

      <div className="mt-4 space-y-1">
        <div className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">Total Yield</div>
        <div className="text-3xl font-semibold text-[#CCFF00]">TOTAL YIELD: {totalYieldEth} ETH</div>
      </div>

      <div className="mt-4">
        <div className="text-[11px] uppercase tracking-[0.2em] text-neutral-500 mb-2">Recent Revenue</div>
        <div className="space-y-1 rounded-lg border border-neutral-800 bg-neutral-950/70 p-3">
          {recentEvents.length === 0 && <div className="text-neutral-600 text-xs">No events yet</div>}
          {recentEvents.map((evt) => {
            const amt = formatEther(BigInt(evt.amount || 0))
            return (
              <div
                key={evt.tx_hash}
                className="flex items-center justify-between text-xs text-neutral-200 border-b border-neutral-900 last:border-b-0 pb-1 last:pb-0"
              >
                <span className="text-[#CCFF00] font-semibold">{evt.type || "REVENUE"}</span>
                <span className="text-neutral-400">{amt} ETH</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
