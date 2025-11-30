"use client"

import { useEffect, useRef } from "react"
import { createPublicClient, http } from "viem"
import { SOVRY_LAUNCHPAD_ADDRESS } from "@/services/storyProtocolService"

const STORY_RPC_URL = process.env.NEXT_PUBLIC_STORY_RPC_URL || "https://aeneid.storyrpc.io"

// Graduated event ABI
// Event signature: Graduated(address indexed wrapperToken, uint256 liquidity, address indexed poolAddress)
const GRADUATED_EVENT_ABI = [
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "wrapperToken", type: "address" },
      { indexed: false, internalType: "uint256", name: "liquidity", type: "uint256" },
      { indexed: true, internalType: "address", name: "poolAddress", type: "address" },
    ],
    name: "Graduated",
    type: "event",
  },
] as const

export interface GraduationEventData {
  tokenAddress: string
  finalRaise: bigint
  liquidityPoolAddress: string
}

export interface UseGraduationEventOptions {
  tokenAddress: string | null
  onGraduation?: (data: GraduationEventData) => void
  enabled?: boolean
}

export function useGraduationEvent({
  tokenAddress,
  onGraduation,
  enabled = true,
}: UseGraduationEventOptions) {
  const publicClient = createPublicClient({
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

  const onGraduationRef = useRef(onGraduation)
  const isWatchingRef = useRef(false)

  // Update ref when callback changes
  useEffect(() => {
    onGraduationRef.current = onGraduation
  }, [onGraduation])

  useEffect(() => {
    if (!enabled || !tokenAddress || isWatchingRef.current) return

    isWatchingRef.current = true

    const unwatch = publicClient.watchContractEvent({
      address: SOVRY_LAUNCHPAD_ADDRESS as `0x${string}`,
      abi: GRADUATED_EVENT_ABI,
      eventName: "Graduated",
      onLogs: (logs) => {
        for (const log of logs) {
          // Filter to only process events for the current token
          const eventTokenAddress = log.args.wrapperToken?.toLowerCase()
          if (eventTokenAddress === tokenAddress.toLowerCase()) {
            const eventData: GraduationEventData = {
              tokenAddress: log.args.wrapperToken || tokenAddress,
              finalRaise: log.args.liquidity || 0n, // liquidity is the second parameter
              liquidityPoolAddress: log.args.poolAddress || "",
            }

            onGraduationRef.current?.(eventData)
          }
        }
      },
    })

    return () => {
      unwatch()
      isWatchingRef.current = false
    }
  }, [tokenAddress, enabled, publicClient])
}

