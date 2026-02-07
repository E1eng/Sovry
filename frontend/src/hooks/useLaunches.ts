"use client"

import { useState, useEffect, useCallback } from "react"
import { type Address, formatEther } from "viem"
import { logger } from "@/lib/logger"
import { supabase } from "@/lib/supabaseClient"
import { fetchSubgraph } from "@/services/subgraph"
import { newLaunchpadAbi } from "@/services/launchpadService"
import { getStoryPublicClient } from "@/services/viem/storyPublicClient"
import { SOVRY_EXCHANGE_ADDRESS } from "@/services/domain/bondingCurve.service"
import type { Token } from "@/types/supabase"

const GRADUATION_THRESHOLD_IP = 10_000

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
          currentPrice: undefined,
          volume24h: undefined,
          dailyChangePct: null,
        }
      })
  } catch {
    return []
  }
}

type SubgraphTradeRow = {
  wrapper?: { id?: string | null } | null
  timestamp?: string | null
  amount?: string | null
  value?: string | null
  fee?: string | null
}

const publicClient = getStoryPublicClient()
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"

function strip0x(value: string): string {
  if (!value) return value
  return value.startsWith("0x") || value.startsWith("0X") ? value.slice(2) : value
}

function normalizeHex(value: string | null | undefined): string {
  return String(value || "").toLowerCase()
}

function normalizeAddress(value: string | null | undefined): string {
  const v = normalizeHex(value)
  if (!v) return ""

  const no0x = strip0x(v)
  if (/^[0-9a-f]{40}$/.test(no0x)) return `0x${no0x}`
  if (/^0x[0-9a-f]{40}$/.test(v)) return v
  return v
}

function asAddress(value: string | null | undefined): Address | null {
  const normalized = normalizeAddress(value)
  return /^0x[0-9a-f]{40}$/.test(normalized) ? (normalized as Address) : null
}

function toIpFloat(rawWei: string | null | undefined): number {
  try {
    const bi = BigInt(rawWei || "0")
    return Number(formatEther(bi))
  } catch {
    return 0
  }
}

async function resolveWrapperAddress(address: string): Promise<string> {
  const normalized = normalizeAddress(address)
  if (!normalized) return normalized
  const addr = asAddress(normalized)
  if (!addr) return normalized

  try {
    const wrapper = await publicClient.readContract({
      address: SOVRY_EXCHANGE_ADDRESS as Address,
      abi: newLaunchpadAbi,
      functionName: "rtToWrapper",
      args: [addr],
    })

    const wrapperNormalized = normalizeAddress(wrapper as string | null | undefined)
    if (wrapperNormalized && wrapperNormalized !== ZERO_ADDRESS) {
      return wrapperNormalized
    }
  } catch {
    // Ignore and treat as already a wrapper token
  }

  return normalized
}

async function fetchOnchainState(wrapperToken: string): Promise<{
  marketCap: string
  bondingProgress: number
  currentPrice: number
  graduated: boolean
} | null> {
  try {
    const wrapperAddr = asAddress(wrapperToken)
    if (!wrapperAddr) return null

    const [tokenInfoRaw, curveRaw, marketCapRaw] = await Promise.all([
      publicClient.readContract({
        address: SOVRY_EXCHANGE_ADDRESS as Address,
        abi: newLaunchpadAbi,
        functionName: "launchedTokens",
        args: [wrapperAddr],
      }),
      publicClient.readContract({
        address: SOVRY_EXCHANGE_ADDRESS as Address,
        abi: newLaunchpadAbi,
        functionName: "bondingCurves",
        args: [wrapperAddr],
      }),
      publicClient.readContract({
        address: SOVRY_EXCHANGE_ADDRESS as Address,
        abi: newLaunchpadAbi,
        functionName: "getMarketCap",
        args: [wrapperAddr],
      }),
    ])

    const tokenInfo = tokenInfoRaw as any
    const curve = curveRaw as any

    const wrapperAddress = (tokenInfo?.wrapperAddress ?? tokenInfo?.[1]) as string | undefined
    if (!wrapperAddress || normalizeAddress(wrapperAddress) === ZERO_ADDRESS) return null

    const graduated = Boolean(tokenInfo?.graduated ?? tokenInfo?.[6])

    const basePrice = BigInt(curve?.basePrice ?? curve?.[0] ?? 0n)
    const priceIncrement = BigInt(curve?.priceIncrement ?? curve?.[1] ?? 0n)
    const currentSupply = BigInt(curve?.currentSupply ?? curve?.[2] ?? 0n)
    const initialCurveSupply = BigInt(tokenInfo?.initialCurveSupply ?? tokenInfo?.[10] ?? 0n)

    const soldRaw = initialCurveSupply > currentSupply ? initialCurveSupply - currentSupply : 0n
    const soldUnits = soldRaw / (10n ** 18n)
    const currentPriceWei = basePrice + soldUnits * priceIncrement

    const marketCapWei = BigInt((marketCapRaw as bigint | undefined) ?? 0n)
    const marketCap = formatEther(marketCapWei)
    const marketCapNum = Number(marketCap)

    const bondingProgress = GRADUATION_THRESHOLD_IP > 0 && isFinite(marketCapNum)
      ? Math.max(0, Math.min(100, (marketCapNum / GRADUATION_THRESHOLD_IP) * 100))
      : 0

    const currentPrice = currentPriceWei > 0n ? Number(formatEther(currentPriceWei)) : 0

    return { marketCap, bondingProgress, currentPrice, graduated }
  } catch (err) {
    logger.warn("Onchain state fetch failed", wrapperToken, err)
    return null
  }
}

function computeTradePriceIPPerToken(trade: SubgraphTradeRow): number {
  const amountTokens = toIpFloat(trade.amount)
  if (!amountTokens || amountTokens <= 0) return 0

  const valueIp = toIpFloat(trade.value)
  const feeIp = toIpFloat(trade.fee)
  const totalIp = valueIp + feeIp
  return totalIp / amountTokens
}

type TradeStats = { volume24h: number; dailyChangePct: number | null; newestPrice: number }

async function fetchTradeStatsMap24h(
  wrapperIds: string[],
  fromTimestamp: number,
): Promise<Map<string, TradeStats>> {
  const result = new Map<string, TradeStats>()
  try {
    if (wrapperIds.length === 0) return result

    let cutoff = fromTimestamp
    if (cutoff > 10_000_000_000) {
      cutoff = Math.floor(cutoff / 1000)
    }

    const ids = wrapperIds
      .map(normalizeAddress)
      .filter((w) => /^0x[0-9a-f]{40}$/.test(w) && w !== ZERO_ADDRESS)

    if (ids.length === 0) return result

    const query = `
      query TradesForTokens($ids: [String!]!, $from: BigInt!) {
        trades(
          where: { wrapper_in: $ids, timestamp_gte: $from }
          orderBy: timestamp
          orderDirection: desc
          first: 2000
        ) {
          wrapper { id }
          timestamp
          amount
          value
          fee
        }
      }
    `

    const { ok, json } = await fetchSubgraph(query, { ids, from: String(cutoff) })
    if (!ok) return result

    const trades = (json?.data?.trades || []) as SubgraphTradeRow[]
    if (!trades || trades.length === 0) return result

    const lowPriceByWrapper = new Map<string, number>()

    for (const tr of trades) {
      const wrapperId = normalizeAddress(tr?.wrapper?.id)
      if (!wrapperId) continue

      const valueIp = toIpFloat(tr.value)
      const feeIp = toIpFloat(tr.fee)
      const totalIp = valueIp + feeIp

      const price = computeTradePriceIPPerToken(tr)

      const existing = result.get(wrapperId)
      if (!existing) {
        result.set(wrapperId, {
          volume24h: totalIp,
          dailyChangePct: null,
          newestPrice: price,
        })
      } else {
        existing.volume24h += totalIp
      }

      if (price > 0) {
        const prevLow = lowPriceByWrapper.get(wrapperId) || 0
        if (prevLow === 0 || price < prevLow) {
          lowPriceByWrapper.set(wrapperId, price)
        }
      }
    }

    for (const [wrapperId, stats] of result.entries()) {
      const low = lowPriceByWrapper.get(wrapperId) || 0
      if (low > 0 && stats.newestPrice > 0) {
        stats.dailyChangePct = ((stats.newestPrice - low) / low) * 100
      }
    }

    return result
  } catch {
    return result
  }
}

async function enrichWithSubgraph(tokens: LaunchData[]): Promise<LaunchData[]> {
  if (tokens.length === 0) return tokens

  try {
    let now = Math.floor(Date.now() / 1000)
    try {
      const block = await publicClient.getBlock()
      const chainNow = Number(block.timestamp)
      if (isFinite(chainNow) && chainNow > 0) {
        now = chainNow
      }
    } catch {
    }

    const from = Math.max(0, now - 24 * 60 * 60)

    const wrapperCandidates = await Promise.all(tokens.map((t) => resolveWrapperAddress(t.token)))
    const onchainStates = await Promise.all(wrapperCandidates.map((w) => (w ? fetchOnchainState(w) : Promise.resolve(null))))
    const stateMap = new Map<string, NonNullable<Awaited<ReturnType<typeof fetchOnchainState>>>>()
    for (let i = 0; i < wrapperCandidates.length; i++) {
      const w = wrapperCandidates[i]
      const state = onchainStates[i]
      if (!w || !state) continue
      stateMap.set(normalizeAddress(w), state)
    }

    const resolvedWrapperIds = Array.from(
      new Set(
        wrapperCandidates
          .map(normalizeAddress)
          .filter((w) => /^0x[0-9a-f]{40}$/.test(w) && w !== ZERO_ADDRESS)
      )
    )

    if (resolvedWrapperIds.length === 0) {
      logger.warn("Subgraph enrichment: could not resolve wrapper IDs for tokens", {
        tokenCount: tokens.length,
        sample: tokens.slice(0, 3).map((t) => t.token),
      })
    }

    const tradeStatsMap = await fetchTradeStatsMap24h(resolvedWrapperIds, from)

    return tokens.map((token, index) => {
      const wrapperIdForTrades = normalizeAddress(wrapperCandidates[index]) || normalizeAddress(token.token)
      const state = stateMap.get(normalizeAddress(wrapperIdForTrades))
      const bondingProgress = state?.bondingProgress ?? token.bondingProgress

      const stats = tradeStatsMap.get(normalizeAddress(wrapperIdForTrades))
      const volume24h = stats?.volume24h ?? 0
      const newestPrice = stats?.newestPrice ?? 0
      const dailyChangePct = stats?.dailyChangePct ?? null

      const currentPrice = state?.currentPrice && state.currentPrice > 0
        ? state.currentPrice
        : newestPrice > 0
          ? newestPrice
          : token.currentPrice

      return {
        ...token,
        token: wrapperIdForTrades,
        id: wrapperIdForTrades,
        graduated: state?.graduated ?? token.graduated,
        marketCap: state?.marketCap ?? token.marketCap,
        bondingProgress,
        currentPrice,
        volume24h: volume24h > 0 ? String(volume24h) : token.volume24h,
        dailyChangePct,
      }
    })
  } catch (err) {
    logger.error("Error enriching launches with subgraph:", err)
    return tokens
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

      const enriched = await enrichWithSubgraph(tokens)
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

