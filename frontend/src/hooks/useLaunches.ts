"use client"

import { useState, useEffect, useCallback } from "react"
import { enrichLaunchesData } from "@/services/launchDataService"

const SUBGRAPH_URL =
  process.env.NEXT_PUBLIC_SUBGRAPH_URL ||
  "https://api.goldsky.com/api/public/project_cmhxop6ixrx0301qpd4oi5bb4/subgraphs/sovry-aeneid/1.1.1/gn"

interface BasicLaunch {
  id: string
  token: string
  creator: string
  createdAt: number
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
      query GetLaunches($first: Int!, $skip: Int!) {
        launches(first: $first, skip: $skip, orderBy: createdAt, orderDirection: desc) {
          id
          token
          creator
          createdAt
        }
      }
    `

    const res = await fetch(SUBGRAPH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables: { first, skip } }),
    })

    if (!res.ok) return []

    const json = await res.json()
    const raw = json?.data?.launches || []

    return raw.map((l: any) => ({
      id: l.id as string,
      token: (l.token as string) || (l.id as string),
      creator: l.creator as string,
      createdAt: Number(l.createdAt || 0),
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

      // Enrich launch data
      const wrapperTokens = basicLaunches.map((l) => l.token || l.id)
      const enrichedData = await enrichLaunchesData(wrapperTokens)

      // Fetch launch info to get graduated status
      const { getLaunchInfo } = await import("@/services/launchpadService")
      const launchInfoPromises = wrapperTokens.map((token) => getLaunchInfo(token))
      const launchInfos = await Promise.all(launchInfoPromises)

      // Merge basic launch data with enriched data and graduated status
      const merged: LaunchData[] = basicLaunches.map((basic, index) => {
        const token = basic.token || basic.id
        const enriched = enrichedData.get(token) || {}
        const launchInfo = launchInfos[index]
        return {
          ...basic,
          ...enriched,
          graduated: launchInfo?.graduated || false,
        }
      })

      setLaunches(merged)
    } catch (err) {
      console.error("Error loading launches:", err)
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

