"use client"

import { useQuery } from "@tanstack/react-query"
import { formatEther } from "viem"

const SUBGRAPH_URL = process.env.NEXT_PUBLIC_SUBGRAPH_URL;
if (!SUBGRAPH_URL) {
  throw new Error('NEXT_PUBLIC_SUBGRAPH_URL is required but not set in environment variables');
}

export type Timeframe = "1M" | "5M" | "15M" | "1H" | "1D" | "3D" | "7D"

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

export const TIME_RANGE_SECONDS: Record<Timeframe, number> = {
  // Short-term ranges: use a generous history window so 1m/5m/15m
  // still show meaningful structure for tokens that traded days ago.
  // 1m timeframe: last 24 hours
  "1M": 24 * 60 * 60,
  // 5m timeframe: last 3 days
  "5M": 3 * 24 * 60 * 60,
  // 15m timeframe: last 7 days
  "15M": 7 * 24 * 60 * 60,

  // Higher timeframes
  // 1h timeframe: last 30 days
  "1H": 30 * 24 * 60 * 60,
  // 1d timeframe: last 90 days
  "1D": 90 * 24 * 60 * 60,
  // 3d timeframe: last 180 days
  "3D": 180 * 24 * 60 * 60,
  // 7d timeframe: last 365 days
  "7D": 365 * 24 * 60 * 60,
}

const INTERVAL_SECONDS: Record<Timeframe, number> = {
  // Binance-style candle duration per timeframe
  "1M": 60, // 1 minute candles
  "5M": 5 * 60, // 5 minute candles
  "15M": 15 * 60, // 15 minute candles
  "1H": 60 * 60, // 1 hour candles
  "1D": 24 * 60 * 60, // 1 day candles
  "3D": 3 * 24 * 60 * 60, // 3 day candles
  "7D": 7 * 24 * 60 * 60, // 7 day candles
}

/**
 * Get interval in seconds based on timeframe
 */
export function getIntervalSeconds(timeframe: Timeframe): number {
  return INTERVAL_SECONDS[timeframe] ?? 60 * 60
}

/**
 * Fetch trades from subgraph.
 *
 * Strategy: page backwards in time using a timestamp cursor until we've
 * covered the timeframe window or reached a global max trade count. This is
 * robust for both quiet and very active tokens without overloading the
 * subgraph in a single huge query.
 */
async function fetchTradesFromSubgraph(
  tokenAddress: string,
  timeframe: Timeframe
): Promise<RawTrade[]> {
  const PAGE_SIZE = 1000
  const MAX_TRADES = 10_000

  const now = Math.floor(Date.now() / 1000)
  const rangeSeconds = TIME_RANGE_SECONDS[timeframe]
  const cutoff = rangeSeconds > 0 ? now - rangeSeconds : 0

  const query = `
    query TradesForToken($token: String!, $before: BigInt!, $pageSize: Int!) {
      trades(
        where: { wrapper: $token, timestamp_lte: $before }
        orderBy: timestamp
        orderDirection: desc
        first: $pageSize
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

  const lowerToken = tokenAddress.toLowerCase()
  let allTrades: RawTrade[] = []

  // Start with a very high timestamp cursor so we definitely include the
  // newest trades on the first page.
  let before = "9999999999999"

  // Page backwards until we've either hit the cutoff, run out of trades, or
  // reached the global MAX_TRADES limit.
  while (allTrades.length < MAX_TRADES) {
    const response = await fetch(SUBGRAPH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        variables: {
          token: lowerToken,
          before,
          pageSize: PAGE_SIZE,
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

    const page = (json?.data?.trades || []) as RawTrade[]
    if (!page || page.length === 0) {
      break
    }

    allTrades = allTrades.concat(page)

    // Oldest trade in this page (since orderDirection is desc)
    const oldest = page[page.length - 1]
    const oldestTs = Number(oldest.timestamp || 0)

    // Stop paging once we've gone past the timeframe cutoff
    if (oldestTs <= cutoff || oldestTs <= 0) {
      break
    }

    // Move cursor just before the oldest timestamp to avoid duplicates
    before = String(Math.max(oldestTs - 1, 0))

    // If we received fewer than PAGE_SIZE trades, there are no more pages
    if (page.length < PAGE_SIZE) {
      break
    }
  }

  // Ensure trades are in ascending time order for downstream processing
  return allTrades
    .sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0))
}

/**
 * Process raw trades into processed trades with calculated price
 */
export function processTrades(rawTrades: RawTrade[]): ProcessedTrade[] {
  return rawTrades.map((trade) => {
    const timestamp = Number(trade.timestamp || 0)

    // amount = wrapper token amount (6 decimals), value + fee = IP in 18 decimals
    const amountRaw = BigInt(trade.amount || "0")
    const valueRaw = BigInt(trade.value || "0")
    const feeRaw = BigInt(trade.fee || "0")

    const ipAmount = valueRaw + feeRaw
    const tokenAmount = amountRaw

    // Convert to floating point for price & volume:
    // - ipAmount is native IP in wei (18 decimals)
    // - tokenAmount is wrapper in smallest units (6 decimals)
    const ipFloat = Number(formatEther(ipAmount)) // IP
    const tokenFloat = Number(tokenAmount) / 1e6 // full wrapper tokens

    const price = tokenFloat > 0 ? ipFloat / tokenFloat : 0 // IP per wrapper token
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
export function transformToOHLC(
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
      count: number
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
        count: 1,
      })
    } else {
      // Update existing interval
      existing.high = Math.max(existing.high, trade.price)
      existing.low = Math.min(existing.low, trade.price)
      existing.close = trade.price // Close is always the last price in the interval
      existing.volume += trade.volume
      existing.count += 1
    }
  })

  // Convert map to array and sort by time
  const buckets = Array.from(ohlcMap.entries())
    .map(([time, data]) => ({
      time,
      ...data,
    }))
    .sort((a, b) => a.time - b.time)

  // UX tweak for low-liquidity intervals: when a bucket has only a
  // single trade, treat its open price as the previous candle's close
  // so that the candle body visually reflects the price move instead of
  // rendering as a doji dot. This keeps BUYs showing green bars and
  // SELLs red bars when they move price relative to the last close.
  for (let i = 0; i < buckets.length; i++) {
    const bucket = buckets[i]
    if (bucket.count <= 1) {
      const prevClose = i > 0 ? buckets[i - 1].close : bucket.close
      if (bucket.close !== prevClose) {
        bucket.open = prevClose
        // Ensure high/low still enclose the body
        bucket.high = Math.max(bucket.high, bucket.open, bucket.close)
        bucket.low = Math.min(bucket.low, bucket.open, bucket.close)
      }
    }
  }

  // Fill missing intervals so the chart shows continuous candles across the
  // selected time range. Buckets with no trades become flat candles that carry
  // forward the last close price with zero volume.
  let filledBuckets = buckets
  if (buckets.length > 0 && intervalSeconds > 0) {
    const firstTime = buckets[0].time
    const lastTime = buckets[buckets.length - 1].time

    const continuous: typeof buckets = []
    let bucketIndex = 0
    let currentBucket = buckets[0]

    for (let t = firstTime; t <= lastTime; t += intervalSeconds) {
      if (bucketIndex < buckets.length && buckets[bucketIndex].time === t) {
        currentBucket = buckets[bucketIndex]
        continuous.push(currentBucket)
        bucketIndex += 1
      } else {
        const lastClose = currentBucket.close
        continuous.push({
          time: t,
          open: lastClose,
          high: lastClose,
          low: lastClose,
          close: lastClose,
          volume: 0,
          count: 0,
        })
      }
    }

    filledBuckets = continuous
  }

  // Strip internal count field before returning
  return filledBuckets.map(({ count: _count, ...rest }) => rest)
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

      // Fetch raw trades (most recent N trades for this wrapper)
      const rawTrades = await fetchTradesFromSubgraph(tokenAddress, timeframe)

      // Process trades (calculate prices)
      let processedTrades = processTrades(rawTrades)

      // Apply timeframe window on the client side so charts can still show
      // older tokens even when no recent trades fall into a strict
      // timestamp_gte window.
      const now = Math.floor(Date.now() / 1000)
      const rangeSeconds = TIME_RANGE_SECONDS[timeframe]
      if (rangeSeconds > 0) {
        const cutoff = now - rangeSeconds
        processedTrades = processedTrades.filter(
          (trade) => trade.timestamp >= cutoff,
        )
      }

      // Get interval based on timeframe
      const intervalSeconds = getIntervalSeconds(timeframe)

      // Transform to OHLC data
      const ohlcData = transformToOHLC(processedTrades, intervalSeconds)

      return ohlcData
    },
    enabled: !!tokenAddress,
    staleTime: 5000, // 5 seconds
    refetchInterval: 5000, // Refetch every 5 seconds for near-realtime candles
  })

  return {
    data: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  }
}

