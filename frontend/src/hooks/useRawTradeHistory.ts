"use client"

import { useQuery } from "@tanstack/react-query"
import { formatEther } from "viem"

const SUBGRAPH_URL_RAW = process.env.NEXT_PUBLIC_SUBGRAPH_URL;
if (!SUBGRAPH_URL_RAW) {
  throw new Error('NEXT_PUBLIC_SUBGRAPH_URL is required but not set in environment variables');
}
const SUBGRAPH_URL: string = SUBGRAPH_URL_RAW;

export interface RawTrade {
  timestamp: string
  type: "BUY" | "SELL"
  amount: string
  value: string
  fee: string
  txHash: string
  user?: {
    id?: string | null
  } | null
}

export interface Trade {
  timestamp: number
  isBuy: boolean
  ipAmount: string
  tokenAmount: string
  trader: string
  txHash: string
  formattedIP: string
  formattedTokens: string
}

/**
 * Fetch raw trades from subgraph
 */
async function fetchRawTrades(tokenAddress: string, limit: number = 100): Promise<RawTrade[]> {
  const query = `
    query TradesForToken($token: String!, $limit: Int!) {
      trades(
        where: { wrapper: $token }
        orderBy: timestamp
        orderDirection: desc
        first: $limit
      ) {
        timestamp
        type
        amount
        value
        fee
        txHash
        user { id }
      }
    }
  `

  const response = await fetch(SUBGRAPH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      variables: {
        token: tokenAddress.toLowerCase(),
        limit,
      },
    }),
  })

  if (!response.ok) {
    throw new Error("Subgraph request failed")
  }

  const json = await response.json()

  // The subgraph may occasionally return partial data together with errors
  // (for example, if older entities have missing relations). We log the
  // errors for debugging but still try to use whatever data is available
  // instead of failing the entire Recent Activity UI.
  if (json.errors && json.errors.length > 0) {
    console.warn("Subgraph trade query returned errors", json.errors)
  }

  const trades = (json?.data?.trades || []) as RawTrade[]
  return trades
}

/**
 * Process raw trades into formatted trades
 */
function processTrades(rawTrades: RawTrade[]): Trade[] {
  return rawTrades.map((trade) => {
    const timestamp = Number(trade.timestamp || 0)
    const ipValue = trade.value || "0"
    const fee = trade.fee || "0"
    const amount = trade.amount || "0"

    // Total IP paid/received = base value + fee
    const ipRaw = BigInt(ipValue) + BigInt(fee)
    const tokenRaw = BigInt(amount)
    const isBuy = trade.type === "BUY"
    const trader = trade.user?.id || ""

    // amount is in wrapper smallest units (6 decimals). Convert to 18-dec for formatting.
    const tokenWei = tokenRaw * (10n ** 12n)
    const ipFloat = parseFloat(formatEther(ipRaw))
    const tokenFloat = parseFloat(formatEther(tokenWei))

    const formatFloat = (value: number): string => {
      if (!isFinite(value) || value === 0) return "0"
      const abs = Math.abs(value)
      if (abs >= 1) return value.toFixed(4).replace(/\.0+$/, "").replace(/\.$/, "")
      if (abs >= 0.0001) return value.toFixed(6).replace(/0+$/, "").replace(/\.$/, "")
      if (abs >= 0.00000001) return value.toFixed(8).replace(/0+$/, "").replace(/\.$/, "")
      return "<0.00000001"
    }

    return {
      timestamp,
      isBuy,
      ipAmount: ipRaw.toString(),
      tokenAmount: tokenRaw.toString(),
      trader,
      txHash: trade.txHash || "",
      formattedIP: formatFloat(ipFloat),
      formattedTokens: formatFloat(tokenFloat),
    }
  })
}

/**
 * Hook to fetch raw trade history for transaction list
 */
export function useRawTradeHistory(tokenAddress: string | null, limit: number = 100) {
  const query = useQuery({
    queryKey: ["rawTradeHistory", tokenAddress, limit],
    queryFn: async () => {
      if (!tokenAddress) {
        throw new Error("Token address is required")
      }

      const rawTrades = await fetchRawTrades(tokenAddress, limit)
      const processedTrades = processTrades(rawTrades)

      return processedTrades
    },
    enabled: !!tokenAddress,
    staleTime: 30000, // 30 seconds
    refetchInterval: 30000, // Auto-refresh every 30 seconds
  })

  return {
    trades: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  }
}


