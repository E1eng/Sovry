"use client"

import { useState, useEffect, useCallback } from "react"
import { enrichLaunchesData } from "@/services/launchDataService"

const SUBGRAPH_URL_RAW = process.env.NEXT_PUBLIC_SUBGRAPH_URL;
if (!SUBGRAPH_URL_RAW) {
  throw new Error('NEXT_PUBLIC_SUBGRAPH_URL is required but not set in environment variables');
}
const SUBGRAPH_URL: string = SUBGRAPH_URL_RAW;

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

    const res = await fetch(SUBGRAPH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables: { first, skip } }),
    })

    if (!res.ok) return []

    const json = await res.json()
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

      // Enrich launch data
      const wrapperTokens = basicLaunches.map((l) => l.token || l.id)
      const enrichedData = await enrichLaunchesData(wrapperTokens)

      // Merge basic launch data with enriched data and graduated status from subgraph
      const merged: LaunchData[] = basicLaunches.map((basic) => {
        const token = basic.token || basic.id
        const enriched = enrichedData.get(token) || {}

        const graduatedFromChain = (enriched as any)?.graduated
        const graduated = typeof graduatedFromChain === "boolean" ? graduatedFromChain : basic.graduated

        return {
          ...basic,
          ...enriched,
          graduated,
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

