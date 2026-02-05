"use client"

import { useState, useEffect, useCallback } from "react"
import { logger } from "@/lib/logger"
import { supabase } from "@/lib/supabaseClient"
import type { Token } from "@/types/supabase"

export interface LaunchData {
  id: string
  token: string
  creator: string
  createdAt: number
  symbol?: string
  name?: string
  imageUrl?: string
  marketCap?: string
  bondingProgress?: number
  category?: string
  graduated?: boolean
}

async function fetchTokensFromSupabase(limit: number): Promise<LaunchData[]> {
  try {
    if (!supabase || typeof (supabase as any).from !== "function") return []

    const { data, error } = await supabase
      .from("tokens")
      .select("token_address, name, symbol, image_uri, creator, created_at")
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error || !Array.isArray(data)) {
      return []
    }

    return (data as Token[])
      .filter((row) => typeof row.token_address === "string" && row.token_address.length > 0)
      .map((row) => {
        const createdAt = row.created_at ? Math.floor(new Date(row.created_at).getTime() / 1000) : 0
        const address = row.token_address.toLowerCase()

        return {
          id: address,
          token: address,
          creator: (row.creator || "").toLowerCase(),
          createdAt,
          graduated: false,
          name: row.name || undefined,
          symbol: row.symbol || undefined,
          imageUrl: row.image_uri || undefined,
          marketCap: undefined,
          bondingProgress: undefined,
        }
      })
  } catch {
    return []
  }
}

export function useLaunches(limit: number = 8) {
  const [launches, setLaunches] = useState<LaunchData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadLaunches = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const tokens = await fetchTokensFromSupabase(limit)
      if (tokens.length === 0) {
        setLaunches([])
        return
      }

      setLaunches(tokens)
    } catch (err) {
      logger.error("Error loading launches:", err)
      setError(err instanceof Error ? err.message : "Failed to load launches")
      setLaunches([])
    } finally {
      setLoading(false)
    }
  }, [limit])

  useEffect(() => {
    loadLaunches()
  }, [loadLaunches])

  return { launches, loading, error, retry: loadLaunches }
}

