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
        supabase
          .from("tokens")
          .select("total_harvested_amount, unclaimed_amount")
          .eq("token_address", tokenAddress)
          .single(),
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
        "rounded-sm border border-border bg-card p-4 text-sm text-foreground font-mono",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Royalty Yield</div>
        <div className="flex items-center gap-2 rounded-sm border border-border px-3 py-1 text-[11px] font-semibold bg-muted/40">
          <span className={cn("h-2 w-2 rounded-full", unclaimed > 0n ? "bg-primary animate-pulse" : "bg-muted-foreground/40")} />
          <span className={unclaimed > 0n ? "text-primary" : "text-muted-foreground"}>Vault: {status}</span>
        </div>
      </div>

      <div className="mt-4 space-y-1">
        <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Total Yield</div>
        <div className="text-2xl font-semibold text-primary tabular-nums">{totalYieldEth} IP</div>
      </div>

      <div className="mt-4">
        <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2">Recent Revenue</div>
        <div className="space-y-1 rounded-sm border border-border bg-muted/30 p-3">
          {recentEvents.length === 0 && <div className="text-muted-foreground/60 text-xs">No events yet</div>}
          {recentEvents.map((evt) => {
            const amt = formatEther(BigInt(evt.amount || 0))
            return (
              <div
                key={evt.tx_hash}
                className="flex items-center justify-between text-xs text-foreground border-b border-border last:border-b-0 pb-1 last:pb-0"
              >
                <span className="text-primary font-semibold">{evt.type || "REVENUE"}</span>
                <span className="text-muted-foreground tabular-nums">{amt} IP</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
