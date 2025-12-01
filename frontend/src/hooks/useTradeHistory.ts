"use client"

import { useQuery } from "@tanstack/react-query"
import { formatEther } from "viem"

const SUBGRAPH_URL =
  process.env.NEXT_PUBLIC_SUBGRAPH_URL ||
  "https://api.goldsky.com/api/public/project_cmhxop6ixrx0301qpd4oi5bb4/subgraphs/sovry-aeneid/1.1.1/gn"

export type Timeframe = "1H" | "24H" | "7D" | "ALL"

// Shape aligned with current Trade entity in the subgraph
export interface RawTrade {
  timestamp: string
  type: "BUY" | "SELL"
  amount: string
  value: string
  fee: string
  txHash: string
}

export interface ProcessedTrade {
  timestamp: number
  ipAmount: bigint
  tokenAmount: bigint
  price: number
  volume: number
}

export interface CandlestickData {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

const TIME_RANGE_SECONDS: Record<Timeframe, number> = {
  "1H": 60 * 60,
  "24H": 24 * 60 * 60,
  "7D": 7 * 24 * 60 * 60,
  "ALL": 0,
}

/**
 * Get interval in seconds based on timeframe
 */
function getIntervalSeconds(timeframe: Timeframe): number {
  switch (timeframe) {
    case "1H":
      return 5 * 60 // 5 minutes
    case "24H":
      return 15 * 60 // 15 minutes
    case "7D":
      return 60 * 60 // 1 hour
    case "ALL":
      return 24 * 60 * 60 // 1 day
    default:
      return 60 * 60 // Default to 1 hour
  }
}

/**
 * Fetch trades from subgraph
 */
async function fetchTradesFromSubgraph(
  tokenAddress: string,
  timeframe: Timeframe
): Promise<RawTrade[]> {
  const now = Math.floor(Date.now() / 1000)
  const from = timeframe === "ALL" ? 0 : now - TIME_RANGE_SECONDS[timeframe]

  const query = `
    query TradesForToken($token: String!, $from: BigInt!) {
      trades(
        where: { wrapper: $token, timestamp_gte: $from }
        orderBy: timestamp
        orderDirection: asc
      ) {
        timestamp
        type
        amount
        value
        fee
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
        from: from.toString(),
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
 * Process raw trades into processed trades with calculated price
 */
function processTrades(rawTrades: RawTrade[]): ProcessedTrade[] {
  return rawTrades.map((trade) => {
    const timestamp = Number(trade.timestamp || 0)

    // amount = wrapper token amount (6 decimals), value + fee = IP in 18 decimals
    const amountRaw = BigInt(trade.amount || "0")
    const valueRaw = BigInt(trade.value || "0")
    const feeRaw = BigInt(trade.fee || "0")

    const ipAmount = valueRaw + feeRaw
    const tokenAmount = amountRaw

    // Convert to floating point for price & volume using 18-decimals
    const tokenWei = tokenAmount * (10n ** 12n) // 6 -> 18 decimals
    const ipFloat = Number(formatEther(ipAmount))
    const tokenFloat = Number(formatEther(tokenWei))

    const price = tokenFloat > 0 ? ipFloat / tokenFloat : 0
    const volume = ipFloat

    return {
      timestamp,
      ipAmount,
      tokenAmount,
      price,
      volume,
    }
  })
}

/**
 * Transform processed trades into OHLC candlestick data
 */
function transformToOHLC(
  trades: ProcessedTrade[],
  intervalSeconds: number
): CandlestickData[] {
  if (trades.length === 0) return []

  // Group trades by time interval
  const ohlcMap = new Map<
    number,
    {
      open: number
      high: number
      low: number
      close: number
      volume: number
    }
  >()

  trades.forEach((trade) => {
    // Round timestamp to interval boundary
    const bucket = Math.floor(trade.timestamp / intervalSeconds) * intervalSeconds
    const existing = ohlcMap.get(bucket)

    if (!existing) {
      // First trade in this interval - set all OHLC to this price
      ohlcMap.set(bucket, {
        open: trade.price,
        high: trade.price,
        low: trade.price,
        close: trade.price,
        volume: trade.volume,
      })
    } else {
      // Update existing interval
      existing.high = Math.max(existing.high, trade.price)
      existing.low = Math.min(existing.low, trade.price)
      existing.close = trade.price // Close is always the last price in the interval
      existing.volume += trade.volume
    }
  })

  // Convert map to array and sort by time
  return Array.from(ohlcMap.entries())
    .map(([time, data]) => ({
      time,
      ...data,
    }))
    .sort((a, b) => a.time - b.time)
}

/**
 * Hook to fetch and transform trade history into OHLC candlestick data
 * @param tokenAddress - Token address to fetch trades for
 * @param timeframe - Time range for trades (1H, 24H, 7D, ALL)
 * @returns { data, isLoading, error, refetch }
 */
export function useTradeHistory(
  tokenAddress: string | null,
  timeframe: Timeframe = "7D"
) {
  const query = useQuery({
    queryKey: ["tradeHistory", tokenAddress, timeframe],
    queryFn: async () => {
      if (!tokenAddress) {
        throw new Error("Token address is required")
      }

      // Fetch raw trades
      const rawTrades = await fetchTradesFromSubgraph(tokenAddress, timeframe)

      // Process trades (calculate prices)
      const processedTrades = processTrades(rawTrades)

      // Get interval based on timeframe
      const intervalSeconds = getIntervalSeconds(timeframe)

      // Transform to OHLC data
      const ohlcData = transformToOHLC(processedTrades, intervalSeconds)

      return ohlcData
    },
    enabled: !!tokenAddress,
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // Refetch every minute
  })

  return {
    data: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  }
}

