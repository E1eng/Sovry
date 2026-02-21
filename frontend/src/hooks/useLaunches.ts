"use client"

import { useState, useEffect, useCallback } from "react"
import { logger } from "@/lib/logger"

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
  currentPrice?: number
  volume24h?: string
  dailyChangePct?: number | null
  category?: string
  graduated?: boolean
}

async function fetchEnrichedLaunches(limit: number): Promise<LaunchData[]> {
  try {
    const res = await fetch(`/api/launches?limit=${limit}`, { cache: "no-store" })
    if (!res.ok) {
      logger.warn("Failed to fetch enriched launches", { status: res.status })
      return []
    }
    const json = await res.json()
    return (json?.launches || []) as LaunchData[]
  } catch (err) {
    logger.error("Error fetching enriched launches:", err)
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

      const enriched = await fetchEnrichedLaunches(limit)
      setLaunches(enriched)
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

