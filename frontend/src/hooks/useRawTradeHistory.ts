"use client"

import { useQuery } from "@tanstack/react-query"
import { formatEther } from "viem"

const SUBGRAPH_URL =
  process.env.NEXT_PUBLIC_SUBGRAPH_URL ||
  "https://api.goldsky.com/api/public/project_cmhxop6ixrx0301qpd4oi5bb4/subgraphs/sovry-aeneid/1.1.1/gn"

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

    return {
      timestamp,
      isBuy,
      ipAmount: ipRaw.toString(),
      tokenAmount: tokenRaw.toString(),
      trader,
      txHash: trade.txHash || "",
      formattedIP: parseFloat(formatEther(ipRaw)).toFixed(4),
      formattedTokens: parseFloat(formatEther(tokenWei)).toFixed(4),
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

