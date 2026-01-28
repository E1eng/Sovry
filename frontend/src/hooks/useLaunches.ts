"use client"

import { useState, useEffect, useCallback } from "react"
import { logger } from "@/lib/logger"
import { fetchSubgraph } from "@/services/subgraph"

interface BasicLaunch {
  id: string
  token: string
  creator: string
  createdAt: number
  graduated: boolean
}

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

async function fetchLaunches(first: number, skip: number): Promise<BasicLaunch[]> {
  try {
    const query = `
      query GetWrapperTokens($first: Int!, $skip: Int!) {
        wrapperTokens(first: $first, skip: $skip, orderBy: launchTime, orderDirection: desc) {
          id
          creator
          launchTime
          graduated
        }
      }
    `

    const { ok, json } = await fetchSubgraph(query, { first, skip })

    if (!ok) return []
    const raw = json?.data?.wrapperTokens || []

    return raw.map((l: any) => ({
      id: l.id as string,
      token: l.id as string,
      creator: l.creator as string,
      createdAt: Number(l.launchTime || 0),
      graduated: Boolean(l.graduated),
    }))
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

      // Fetch basic launch data
      const basicLaunches = await fetchLaunches(limit, 0)
      
      if (basicLaunches.length === 0) {
        setLaunches([])
        setLoading(false)
        return
      }

      // Subgraph-only data for home list (no RPC)
      const merged: LaunchData[] = basicLaunches.map((basic) => ({
        ...basic,
        marketCap: undefined,
        bondingProgress: undefined,
      }))

      setLaunches(merged)
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

