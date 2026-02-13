"use client"

import { useState, useEffect, useCallback } from "react"
import { formatEther } from "viem"
import type { LaunchInfo } from "@/services/launchpadService"
import {
  getGraduationInfo,
  type GraduationInfo,
  getWrapperTokenMeta,
  type WrapperTokenMeta,
} from "@/services/graduationService"
import { supabase } from "@/lib/supabaseClient"
import { logError } from "@/lib/errorUtils"

export interface LaunchDetails {
  tokenAddress: string
  symbol?: string
  name?: string
  imageUrl?: string
  marketCap?: string
  reserveBalance?: string
  bondingProgress?: number
  category?: string
  currentPrice?: string
  rtAddress?: string
  ipId?: string
  // Both camelCase and snake_case for convenience in components
  metadataUri?: string
  metadata_uri?: string
  mediaType?: string
  twitter?: string
  telegram?: string
  website?: string
  launchInfo?: LaunchInfo | null
  graduationInfo?: GraduationInfo | null
  wrapperMeta?: WrapperTokenMeta | null
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

      const { getLaunchInfo, getBondingProgress, getMarketCap } = await import("@/services/launchpadService")

      // Fetch launch info, graduation info, market cap, and subgraph wrapper metadata in parallel
      const [launchInfo, graduationInfo, marketCapStr, wrapperMeta] = await Promise.all([
        getLaunchInfo(tokenAddress).catch((err) => {
          logError(err, "useLaunchDetails.getLaunchInfo")
          return null
        }),
        getGraduationInfo(tokenAddress).catch((err) => {
          logError(err, "useLaunchDetails.getGraduationInfo")
          return null
        }),
        getMarketCap(tokenAddress).catch((err) => {
          logError(err, "useLaunchDetails.getMarketCap")
          return null
        }),
        getWrapperTokenMeta(tokenAddress).catch((err) => {
          logError(err, "useLaunchDetails.getWrapperTokenMeta")
          return null
        }),
      ])

      const bondingProgress = getBondingProgress(launchInfo)

      // Load socials and optional metadata overrides from Supabase
      // `launches` table. We may have stored either the RT, the royalty
      // vault, or another canonical address as `royalty_token_address`, so
      // try multiple candidates and use the first matching row.
      let twitter: string | undefined
      let telegram: string | undefined
      let website: string | undefined
      let imageUrlFromSupabase: string | undefined
      let nameFromSupabase: string | undefined
      let symbolFromSupabase: string | undefined
      let metadataUriFromSupabase: string | undefined
      let mediaTypeFromSupabase: string | undefined

      try {
        const wrapperCandidates = new Set<string>()
        wrapperCandidates.add(tokenAddress)
        wrapperCandidates.add(tokenAddress.toLowerCase())

        if (supabase) {
          const { data: tokenRows, error: tokenErr } = await supabase
            .from("tokens")
            .select("token_address, name, symbol, image_uri")
            .in("token_address", Array.from(wrapperCandidates))
            .limit(1)

          if (!tokenErr && Array.isArray(tokenRows) && tokenRows.length > 0) {
            const token = tokenRows[0] as any
            nameFromSupabase = token.name || undefined
            symbolFromSupabase = token.symbol || undefined
            imageUrlFromSupabase = token.image_uri || undefined
          }
        }

        const candidates = new Set<string>()

        const rtFromWrapper = (wrapperMeta as any)?.rt as string | undefined
        const rtFromLaunchInfo = (launchInfo as any)?.royaltyToken as string | undefined
        const vaultFromLaunchInfo = (launchInfo as any)?.royaltyVault as string | undefined

        for (const addr of [rtFromWrapper, rtFromLaunchInfo, vaultFromLaunchInfo]) {
          if (addr) {
            // Support both original- and lower-case storage in Supabase
            candidates.add(addr)
            candidates.add(addr.toLowerCase())
          }
        }

        const candidateArray = Array.from(candidates)

        if (supabase && candidateArray.length > 0) {
          const { data, error: supabaseError } = await supabase
            .from("launches")
            .select(
              "twitter_url, telegram_url, website_url, royalty_token_address, image_url, name, symbol, metadata_uri",
            )
            .in("royalty_token_address", candidateArray)
            .limit(1)

          if (!supabaseError && Array.isArray(data) && data.length > 0) {
            const row = data[0] as any
            twitter = row.twitter_url || undefined
            telegram = row.telegram_url || undefined
            website = row.website_url || undefined
            imageUrlFromSupabase = imageUrlFromSupabase ?? row.image_url ?? undefined
            nameFromSupabase = nameFromSupabase ?? row.name ?? undefined
            symbolFromSupabase = symbolFromSupabase ?? row.symbol ?? undefined
            metadataUriFromSupabase = row.metadata_uri || undefined
          }
        }
      } catch (supabaseErr) {
        logError(supabaseErr, "useLaunchDetails.loadSupabaseSocials")
      }

      // Check if token exists on-chain even if not in subgraph
      if (!launchInfo) {
        const errorMsg = "Token not found. If you just created this token, it may take a few moments to appear in the indexer."
        setError(errorMsg)
        setDetails(null)
        logError(new Error(`Token not found: ${tokenAddress}`), "useLaunchDetails")
        return
      }

      setDetails({
        tokenAddress,
        rtAddress: launchInfo.royaltyToken || undefined,
        graduated: launchInfo.graduated,
        category: "IP Asset",
        marketCap: marketCapStr || undefined,
        bondingProgress: bondingProgress || undefined,
        reserveBalance: formatEther(launchInfo.reserveBalance),
        imageUrl: imageUrlFromSupabase,
        name: nameFromSupabase,
        symbol: symbolFromSupabase,
        metadataUri: metadataUriFromSupabase,
        metadata_uri: metadataUriFromSupabase,
        // Default mediaType to 'image' when we have metadata_uri but no explicit media_type
        mediaType: mediaTypeFromSupabase ?? "image",
        twitter,
        telegram,
        website,
        launchInfo: launchInfo || null,
        graduationInfo: graduationInfo || null,
        wrapperMeta: wrapperMeta || null,
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

