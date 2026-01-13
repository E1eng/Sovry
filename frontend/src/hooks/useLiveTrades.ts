"use client"

import { useEffect, useRef, useState } from "react"
import { createPublicClient, http } from "viem"
import { SOVRY_LAUNCHPAD_ADDRESS } from "@/services/storyProtocolService"
import { STORY_RPC_URL } from "@/lib/env"
import {
  Timeframe,
  RawTrade,
  ProcessedTrade,
  CandlestickData,
  getIntervalSeconds,
  TIME_RANGE_SECONDS,
  processTrades,
  transformToOHLC,
} from "@/hooks/useTradeHistory"

const TRADE_EVENTS_ABI = [
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "buyer", type: "address" },
      { indexed: true, internalType: "address", name: "wrapperToken", type: "address" },
      { indexed: false, internalType: "uint256", name: "amount", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "cost", type: "uint256" },
    ],
    name: "TokensPurchased",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "seller", type: "address" },
      { indexed: true, internalType: "address", name: "wrapperToken", type: "address" },
      { indexed: false, internalType: "uint256", name: "amount", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "proceeds", type: "uint256" },
    ],
    name: "TokensSold",
    type: "event",
  },
] as const

interface UseLiveTradesResult {
  candles: CandlestickData[]
  isLiveConnected: boolean
  error: Error | null
}

export function useLiveTrades(tokenAddress: string | null, timeframe: Timeframe): UseLiveTradesResult {
  const [candles, setCandles] = useState<CandlestickData[]>([])
  const [isLiveConnected, setIsLiveConnected] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const liveTradesRef = useRef<ProcessedTrade[]>([])
  const clientRef = useRef<ReturnType<typeof createPublicClient> | null>(null)
  const unwatchBuyRef = useRef<(() => void) | null>(null)
  const unwatchSellRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!tokenAddress) {
      return
    }

    const lowerToken = tokenAddress.toLowerCase()

    try {
      const client =
        clientRef.current ||
        createPublicClient({
          chain: {
            id: 1315,
            name: "Story Aeneid Testnet",
            nativeCurrency: { name: "IP", symbol: "IP", decimals: 18 },
            rpcUrls: {
              default: { http: [STORY_RPC_URL] },
            },
          },
          transport: http(STORY_RPC_URL),
        })

      clientRef.current = client
      setIsLiveConnected(true)
      setError(null)

      liveTradesRef.current = []
      setCandles([])

      const handleLogs = (logs: any[], type: "BUY" | "SELL") => {
        if (!logs || logs.length === 0) return

        const newTrades: ProcessedTrade[] = []

        for (const log of logs) {
          const args: any = log.args || {}
          const wrapper = (args.wrapperToken as string | undefined)?.toLowerCase()
          if (!wrapper || wrapper !== lowerToken) continue

          const amount = BigInt(args.amount ?? 0n)
          if (amount === 0n) continue

          const valueBase =
            type === "BUY" ? BigInt(args.cost ?? 0n) : BigInt(args.proceeds ?? 0n)

          const feeApprox = valueBase / 100n

          const raw: RawTrade = {
            timestamp: String(Math.floor(Date.now() / 1000)),
            type,
            amount: amount.toString(),
            value: valueBase.toString(),
            fee: feeApprox.toString(),
            txHash: log.transactionHash as string,
          }

          const processedArr = processTrades([raw])
          if (processedArr.length > 0) {
            newTrades.push(processedArr[0])
          }
        }

        if (newTrades.length === 0) return

        // Append new trades to buffer
        liveTradesRef.current = [...liveTradesRef.current, ...newTrades]

        // Trim buffer to the same time window as subgraph history
        const rangeSeconds = TIME_RANGE_SECONDS[timeframe]
        if (rangeSeconds > 0) {
          const nowSec = Math.floor(Date.now() / 1000)
          const cutoff = nowSec - rangeSeconds
          liveTradesRef.current = liveTradesRef.current.filter((t) => t.timestamp >= cutoff)
        }

        const intervalSeconds = getIntervalSeconds(timeframe)
        const liveCandles = transformToOHLC(liveTradesRef.current, intervalSeconds)
        setCandles(liveCandles)
      }

      const unwatchBuy = client.watchContractEvent({
        address: SOVRY_LAUNCHPAD_ADDRESS as `0x${string}`,
        abi: TRADE_EVENTS_ABI,
        eventName: "TokensPurchased",
        onLogs: (logs) => handleLogs(logs, "BUY"),
        onError: (err) => setError(err as Error),
      })

      const unwatchSell = client.watchContractEvent({
        address: SOVRY_LAUNCHPAD_ADDRESS as `0x${string}`,
        abi: TRADE_EVENTS_ABI,
        eventName: "TokensSold",
        onLogs: (logs) => handleLogs(logs, "SELL"),
        onError: (err) => setError(err as Error),
      })

      unwatchBuyRef.current = unwatchBuy
      unwatchSellRef.current = unwatchSell

      return () => {
        if (unwatchBuyRef.current) {
          unwatchBuyRef.current()
          unwatchBuyRef.current = null
        }
        if (unwatchSellRef.current) {
          unwatchSellRef.current()
          unwatchSellRef.current = null
        }
        liveTradesRef.current = []
        setCandles([])
        setIsLiveConnected(false)
      }
    } catch (err) {
      setError(err as Error)
      setIsLiveConnected(false)
    }
  }, [tokenAddress, timeframe])

  return { candles, isLiveConnected, error }
}
