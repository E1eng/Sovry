"use client"

import { useQuery } from "@tanstack/react-query"
import { formatEther } from "viem"

const SUBGRAPH_URL =
  process.env.NEXT_PUBLIC_SUBGRAPH_URL ||
  "https://api.goldsky.com/api/public/project_cmhxop6ixrx0301qpd4oi5bb4/subgraphs/sovry-aeneid/1.1.1/gn"

export interface RawTrade {
  timestamp: string
  isBuy: boolean
  amountIP: string
  amountTokens: string
  trader: string
  txHash: string
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
    query TradesForToken($token: Bytes!, $limit: Int!) {
      trades(
        where: { token: $token }
        orderBy: timestamp
        orderDirection: desc
        first: $limit
      ) {
        timestamp
        isBuy
        amountIP
        amountTokens
        trader
        txHash
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

  if (json.errors && json.errors.length > 0) {
    throw new Error(json.errors[0]?.message || "GraphQL error")
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
    const ipAmount = trade.amountIP || "0"
    const tokenAmount = trade.amountTokens || "0"

    return {
      timestamp,
      isBuy: trade.isBuy,
      ipAmount,
      tokenAmount,
      trader: trade.trader || "",
      txHash: trade.txHash || "",
      formattedIP: parseFloat(formatEther(BigInt(ipAmount))).toFixed(4),
      formattedTokens: parseFloat(formatEther(BigInt(tokenAmount))).toFixed(4),
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

