"use client"

import { useState, useEffect, useCallback } from "react"
import { enrichLaunchData } from "@/services/launchDataService"
import { getLaunchInfo, type LaunchInfo } from "@/services/launchpadService"
import { getGraduationInfo, type GraduationInfo } from "@/services/graduationService"
import { logError } from "@/lib/errorUtils"

export interface LaunchDetails {
  tokenAddress: string
  symbol?: string
  name?: string
  imageUrl?: string
  marketCap?: string
  bondingProgress?: number
  category?: string
  currentPrice?: string
  rtAddress?: string
  launchInfo?: LaunchInfo | null
  graduationInfo?: GraduationInfo | null
}

export function useLaunchDetails(tokenAddress: string | null) {
  const [details, setDetails] = useState<LaunchDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadDetails = useCallback(async () => {
    if (!tokenAddress) {
      setDetails(null)
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)

      // Fetch launch info, enriched data, and graduation info in parallel
      const [launchInfo, enrichedData, graduationInfo] = await Promise.all([
        getLaunchInfo(tokenAddress).catch((err) => {
          logError(err, "useLaunchDetails.getLaunchInfo")
          return null
        }),
        enrichLaunchData(tokenAddress).catch((err) => {
          logError(err, "useLaunchDetails.enrichLaunchData")
          // If enrichment fails, we can still show basic info
          return null
        }),
        getGraduationInfo(tokenAddress).catch((err) => {
          logError(err, "useLaunchDetails.getGraduationInfo")
          return null
        }),
      ])

      // Check if token exists on-chain even if not in subgraph
      if (!launchInfo && !enrichedData) {
        // Token might be recently created and not yet indexed
        // Try to check if it's a valid contract address
        const errorMsg = "Token not found. If you just created this token, it may take a few moments to appear in the indexer."
        setError(errorMsg)
        setDetails(null)
        logError(new Error(`Token not found: ${tokenAddress}`), "useLaunchDetails")
        return
      }

      setDetails({
        tokenAddress,
        ...(enrichedData || {}),
        launchInfo: launchInfo || null,
        graduationInfo: graduationInfo || null,
      })
    } catch (err) {
      logError(err, "useLaunchDetails")
      const errorMessage = err instanceof Error ? err.message : "Failed to load launch details"
      
      // Check if it's a network error
      const errorString = errorMessage.toLowerCase()
      if (errorString.includes('network') || errorString.includes('fetch') || errorString.includes('timeout')) {
        setError("Network error. Please check your connection and try again.")
      } else if (errorString.includes('rpc') || errorString.includes('provider')) {
        setError("Blockchain network error. The network may be congested. Please try again.")
      } else {
        setError(errorMessage)
      }
      
      setDetails(null)
    } finally {
      setLoading(false)
    }
  }, [tokenAddress])

  useEffect(() => {
    loadDetails()
  }, [loadDetails])

  return { details, loading, error, retry: loadDetails }
}

