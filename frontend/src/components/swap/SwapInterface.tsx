"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { useDynamicContext } from "@dynamic-labs/sdk-react-core"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Settings, Loader2, AlertTriangle, CheckCircle, ExternalLink } from "lucide-react"
import { parseEther, formatEther } from "viem"
import toast from "react-hot-toast"
import { cn } from "@/lib/utils"
import { getStoryPublicClient } from "@/services/viem/storyPublicClient"
import { useLaunchDetails } from "@/hooks/useLaunchDetails"
import {
  estimateBuyAmountForIp,
  calculateRealPriceImpact,
  calculateBondingCurveSellProceeds,
  type BondingCurveParams,
} from "@/lib/bondingCurve"
import { SlippageSettings } from "@/components/swap/SlippageSettings"
import { erc20Abi } from "viem"
import { parseTransactionError, logError, isSlippageError } from "@/lib/errorUtils"
import { trackTrade, trackEvent } from "@/lib/analytics"
import { logger } from "@/lib/logger"
import { memo, useEffect as useReactEffect } from "react"
import { useTokenData } from "@/hooks/useTokenData"

function trimToDecimals(value: string, maxDecimals: number): string {
  if (!value || maxDecimals < 0) return value
  const dot = value.indexOf(".")
  if (dot === -1) return value
  const integer = value.slice(0, dot)
  const decimals = value.slice(dot + 1)
  const trimmed = decimals.slice(0, maxDecimals).replace(/0+$/, "")
  return trimmed.length > 0 ? `${integer}.${trimmed}` : integer
}

function formatBalance(value: string | null, maxDecimals: number): string {
  if (!value) return "0"
  const num = parseFloat(value)
  if (!isFinite(num) || num === 0) return "0"
  return trimToDecimals(num.toFixed(maxDecimals), maxDecimals)
}

export interface SwapInterfaceProps {
  tokenAddress?: string
  tokenSymbol?: string
  className?: string
  onSwap?: (direction: "buy" | "sell", amount: string) => void
  isGraduated?: boolean
  piperXPoolAddress?: string
}

function SwapInterfaceComponent({
  tokenAddress,
  tokenSymbol = "TOKEN",
  className,
  onSwap: _onSwap,
  isGraduated = false,
  piperXPoolAddress,
}: SwapInterfaceProps) {
  const [activeTab, setActiveTab] = useState<"buy" | "sell">("buy")
  const [fromAmount, setFromAmount] = useState("")
  const [toAmount, setToAmount] = useState("")
  const [showSlippageSettings, setShowSlippageSettings] = useState(false)
  const [debouncedFromAmount, setDebouncedFromAmount] = useState(fromAmount)

  // Load slippage from localStorage, default to 1%
  const [slippage, setSlippage] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("sovry-slippage-tolerance")
      if (saved) {
        const parsed = parseFloat(saved)
        if (!isNaN(parsed) && parsed >= 0.1 && parsed <= 10) {
          return saved
        }
      }
    }
    return "1" // Default 1%
  })
  const [isCalculating, setIsCalculating] = useState(false)
  const [priceImpact, setPriceImpact] = useState<number | null>(null)
  const [exchangeRate, setExchangeRate] = useState("")
  const [isTrading, setIsTrading] = useState(false)
  const [tradeSuccess, setTradeSuccess] = useState(false)
  const [userBalance, setUserBalance] = useState<string | null>(null)
  const [tokenBalance, setTokenBalance] = useState<string | null>(null)
  const [minReceive, setMinReceive] = useState<string | null>(null)
  const [balanceError, setBalanceError] = useState<string | null>(null)
  const [slippageError, setSlippageError] = useState<string | null>(null)
  const [isSimulatingTx, setIsSimulatingTx] = useState(false)
  const [simulationStatus, setSimulationStatus] = useState<string | null>(null)
  const [simulationError, setSimulationError] = useState<string | null>(null)
  const [balanceRefreshNonce, setBalanceRefreshNonce] = useState(0)

  // On-chain token state (multicall) for gating
  const { data: tokenData, isLoading: tokenDataLoading } = useTokenData(tokenAddress)

  const curveParams = useMemo<BondingCurveParams | null>(() => {
    if (!tokenData) return null
    return {
      basePrice: tokenData.alpha,
      priceIncrement: tokenData.beta,
      currentSupply: tokenData.currentSupply,
      initialCurveSupply: tokenData.initialCurveSupply,
    }
  }, [tokenData])

  // Match SovryLaunchpad trading fee for sells (1% of baseProceeds)
  const FEE_BPS = 100n
  const BPS_DENOMINATOR = 10_000n

  // Get wallet connection
  const { primaryWallet } = useDynamicContext()
  const isConnected = !!primaryWallet

  // Track wallet connection state
  useReactEffect(() => {
    if (isConnected && primaryWallet?.address) {
      trackEvent("wallet_connected", {
        address: primaryWallet.address,
      })
    } else {
      trackEvent("wallet_disconnected", {})
    }
  }, [isConnected, primaryWallet?.address])

  // Fetch launch details (for loading state and auxiliary info)
  const { loading: detailsLoading } = useLaunchDetails(tokenAddress || null)

  // Load real  // Loaders and state are handled per-quote and per-tx using fresh curve params

  // Debounce timer ref
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Debounced fromAmount for expensive allowance checks
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedFromAmount(fromAmount)
    }, 1000) // 1s debounce

    return () => clearTimeout(handler)
  }, [fromAmount])

  // Calculate output amount with debouncing
  const calculateOutput = useCallback(
    async (amount: string, isBuy: boolean) => {
      if (!amount || parseFloat(amount) <= 0 || !tokenAddress || tokenDataLoading || !tokenData || !curveParams) {
        setToAmount("")
        setMinReceive(null)
        setPriceImpact(null)
        setExchangeRate("")
        return
      }

      setIsCalculating(true)

      try {
        const amountBigInt = parseEther(amount)
        const paramsForQuote = curveParams
        if (!paramsForQuote) {
          setToAmount("")
          setMinReceive(null)
          setPriceImpact(null)
          setExchangeRate("")
          return
        }
        let impact: number
        if (isBuy) {
          const { amount: tokenAmount, totalCost } = estimateBuyAmountForIp(paramsForQuote, amountBigInt)
          if (tokenAmount === 0n || totalCost === 0n) {
            setToAmount("")
            setMinReceive(null)
            setPriceImpact(null)
            setExchangeRate("")
            return
          }

          // Convert 6-decimal wrapper units to 18-decimal token units for display
          const tokenWei = tokenAmount * (10n ** 12n)
          const expectedTokensStr = formatEther(tokenWei)
          const expectedTokens = parseFloat(expectedTokensStr)

          // Display expected tokens received
          setToAmount(trimToDecimals(expectedTokensStr, 6))

          const slippagePercent = parseFloat(slippage) || 0.5
          const slippageBps = BigInt(Math.floor(slippagePercent * 100))
          const minTokenWei = tokenWei * (BPS_DENOMINATOR - slippageBps) / BPS_DENOMINATOR
          setMinReceive(trimToDecimals(formatEther(minTokenWei), 6))

          impact = calculateRealPriceImpact(paramsForQuote, tokenAmount, true)
          const rate = expectedTokens / parseFloat(amount)
          setExchangeRate(`1 IP = ${rate.toFixed(6)} ${tokenSymbol}`)
        } else {
          // SELL: convert 18-dec UI amount to 6-dec wrapper units
          const tokenWeiIn = amountBigInt
          const wrapperAmount = tokenWeiIn / (10n ** 12n)
          if (wrapperAmount <= 0n) {
            setToAmount("")
            setMinReceive(null)
            setPriceImpact(null)
            setExchangeRate("")
            return
          }

          // Always fetch fresh curve params for sell quotes so we reflect
          // the latest on-chain state (tokens sold, currentSupply, etc.)
          const baseProceeds = calculateBondingCurveSellProceeds(paramsForQuote, wrapperAmount)
          if (baseProceeds <= 0n) {
            setToAmount("")
            setMinReceive(null)
            setPriceImpact(null)
            setExchangeRate("")
            return
          }

          // Apply 1% trading fee to get net proceeds, mirroring SovryLaunchpad.sell
          const fee = (baseProceeds * FEE_BPS) / BPS_DENOMINATOR
          const netProceeds = baseProceeds - fee

          const slippagePercent = parseFloat(slippage) || 0.5
          const slippageBps = BigInt(Math.floor(slippagePercent * 100))
          const minProceeds = netProceeds * (BPS_DENOMINATOR - slippageBps) / BPS_DENOMINATOR

          const expectedIpOutStr = formatEther(netProceeds)
          const minIpOutStr = formatEther(minProceeds)

          setToAmount(trimToDecimals(expectedIpOutStr, 8))
          setMinReceive(trimToDecimals(minIpOutStr, 8))

          impact = calculateRealPriceImpact(paramsForQuote, wrapperAmount, false)
          const rate = parseFloat(formatEther(netProceeds)) / parseFloat(amount)
          setExchangeRate(`1 ${tokenSymbol} = ${rate.toFixed(6)} IP`)
        }
        setPriceImpact(impact)
      } catch (error) {
        logger.error("Error calculating output:", error)
        setToAmount("")
        setMinReceive(null)
        setPriceImpact(null)
        setExchangeRate("")
      } finally {
        setIsCalculating(false)
      }
    },
    [tokenAddress, slippage, tokenSymbol, FEE_BPS, BPS_DENOMINATOR, tokenDataLoading, tokenData, curveParams]
  )

  // Debounced calculation effect
  useEffect(() => {
    // Clear previous timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    // Set timer (0.5s debounce for estimation)
    debounceTimerRef.current = setTimeout(() => {
      if (fromAmount) {
        calculateOutput(fromAmount, activeTab === "buy")
      } else {
        setToAmount("")
        setMinReceive(null)
        setPriceImpact(null)
        setExchangeRate("")
      }
    }, 500)

    // Cleanup
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [fromAmount, activeTab, calculateOutput, tokenAddress])

  // Periodically refresh the estimate every 10 seconds while the user
  // keeps a non-empty input (but hasn't swapped yet), so quotes stay
  // fresh without spamming RPC on every keystroke.
  useEffect(() => {
    if (!debouncedFromAmount || !tokenAddress) return

    const interval = setInterval(() => {
      calculateOutput(debouncedFromAmount, activeTab === "buy")
    }, 10000) // 10s refresh

    return () => clearInterval(interval)
  }, [debouncedFromAmount, activeTab, tokenAddress, calculateOutput])

  // Handle tab change - direction is always IP -> TOKEN for buy, TOKEN -> IP for sell
  const handleTabChange = (value: string) => {
    const newTab = value as "buy" | "sell"
    setActiveTab(newTab)

    // Clear amounts and errors
    setFromAmount("")
    setToAmount("")
    setMinReceive(null)
    setPriceImpact(null)
    setExchangeRate("")
    setBalanceError(null)
    setSlippageError(null)
  }

  // Create public client for balance checks (memoized)
  const publicClient = useMemo(
    () => getStoryPublicClient(),
    []
  )

  // Listen for global balance refresh events triggered after trades
  useEffect(() => {
    if (typeof window === "undefined") return

    const handler = () => {
      setBalanceRefreshNonce((nonce) => nonce + 1)
    }

    window.addEventListener("refresh-balances", handler)

    return () => {
      window.removeEventListener("refresh-balances", handler)
    }
  }, [])

  // Fetch user's IP balance
  useEffect(() => {
    const fetchBalance = async () => {
      if (!primaryWallet?.address) {
        setUserBalance(null)
        return
      }

      try {
        const balance = await publicClient.getBalance({
          address: primaryWallet.address as `0x${string}`,
        })

        setUserBalance(formatEther(balance))
      } catch (error) {
        logger.error("Error fetching balance:", error)
        setUserBalance(null)
      }
    }

    fetchBalance()
  }, [primaryWallet?.address, publicClient, balanceRefreshNonce])

  // Fetch user's token balance (debounced on amount)
  useEffect(() => {
    const fetchTokenBalance = async () => {
      if (!primaryWallet?.address || !tokenAddress) {
        setTokenBalance(null)
        return
      }

      try {
        // Fetch token balance (wrapper uses 6 decimals). Convert to 18-decimal
        // units for display to keep UI consistent with the buy/sell inputs.
        const balance = await publicClient.readContract({
          address: tokenAddress as `0x${string}`,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [primaryWallet.address as `0x${string}`],
        }) as bigint

        const tokenWei = balance * (10n ** 12n)
        setTokenBalance(formatEther(tokenWei))
      } catch (error) {
        logger.error("Error fetching token balance/approval:", error)
        setTokenBalance(null)
      }
    }

    fetchTokenBalance()
  }, [primaryWallet?.address, tokenAddress, publicClient, balanceRefreshNonce])

  // Handle place trade
  const handlePlaceTrade = async () => {
    if (!fromAmount || parseFloat(fromAmount) <= 0 || !tokenAddress) return
    if (tokenDataLoading || !tokenData || !tokenData.isActive || !curveParams) {
      toast.error("Token state unavailable or inactive", { duration: 3000 })
      return
    }

    // Validation
    setSlippageError(null)
    if (!isConnected || !primaryWallet) {
      toast.error("Please connect your wallet", {
        duration: 3000,
      })
      return
    }

    if (activeTab === "buy") {
      // Validate IP balance
      if (!userBalance || parseFloat(userBalance) < parseFloat(fromAmount)) {
        const errorMsg = `Insufficient IP balance. You have ${userBalance || "0"} IP, but need ${fromAmount} IP.`
        setBalanceError(errorMsg)
        toast.error(
          `Insufficient IP balance: You have ${userBalance || "0"} IP`,
          {
            duration: 4000,
          },
        )
        logError(new Error(errorMsg), "SwapInterface")
        return
      }
      setBalanceError(null)

      // Validate amount > 0
      if (parseFloat(fromAmount) <= 0) {
        toast.error("Amount must be greater than 0", {
          duration: 3000,
        })
        return
      }

      // Calculate minTokensOut with slippage using real bonding curve math
      const slippagePercent = parseFloat(slippage) || 1
      const ipAmountBigInt = parseEther(fromAmount)

      const { amount: tokenAmount } = estimateBuyAmountForIp(curveParams, ipAmountBigInt)
      if (tokenAmount <= 0n) {
        toast.error("Amount too small for current bonding curve", {
          duration: 3000,
        })
        return
      }
      const tokenWei = tokenAmount * (10n ** 12n)
      const actualTokensOutFormatted = parseFloat(formatEther(tokenWei))
      const minTokensOut = actualTokensOutFormatted * (1 - slippagePercent / 100)

      // Run Tenderly simulation before sending real transaction
      setSimulationStatus(null)
      setSimulationError(null)
      setIsSimulatingTx(true)
      try {
        await launchpadService.simulateBuy(
          tokenAddress,
          fromAmount,
          primaryWallet.address as string,
        )
        // Simulation passed; proceed silently to on-chain execution
      } catch (simError: any) {
        const message = simError?.message || "Simulation failed"
        logger.error("Tenderly simulation error (buy)", simError)
        const lower = message.toLowerCase()
        const isRateLimited = lower.includes("429") || simError?.status === 429
        const isMethodMissing =
          lower.includes("tenderly_simulate") ||
          lower.includes("does not exist") ||
          lower.includes("is not available")

        if (isRateLimited || isMethodMissing) {
          setSimulationError(
            "Tenderly simulation is unavailable. Proceeding without preview."
          )
          toast.error(`Simulation unavailable: ${message}`, {
            duration: 5000,
          })
        } else {
          setSimulationError(message)
          toast.error(`Simulation failed: ${message}`, {
            duration: 5000,
          })
          setIsSimulatingTx(false)
          return
        }
      }
      setIsSimulatingTx(false)

      setIsTrading(true)
      setTradeSuccess(false)

      // Track trade initiation
      trackEvent("trade_initiated", {
        type: "buy",
        tokenAddress,
        amount: fromAmount,
        slippage: slippagePercent,
      })

      try {
        const result = await launchpadService.buy(
          tokenAddress,
          fromAmount,
          minTokensOut.toFixed(18),
          primaryWallet
        )

        if (result.success) {
          setTradeSuccess(true)
          trackTrade("buy", tokenAddress, fromAmount, true)
          toast.success("Trade Successful!", {
            duration: 2000,
            icon: "✅",
          })

          // Refresh balances after successful trade
          if (primaryWallet?.address) {
            setTimeout(() => {
              // Trigger balance refresh
              const event = new CustomEvent("refresh-balances")
              window.dispatchEvent(event)
            }, 2000)
          }

          // Trigger recent activity refresh for this token
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("refresh-trades", {
                detail: { tokenAddress },
              })
            )
          }

          // Reset form after 2 seconds
          setTimeout(() => {
            setFromAmount("")
            setToAmount("")
            setPriceImpact(null)
            setExchangeRate("")
            setTradeSuccess(false)
          }, 2000)
        } else {
          trackTrade("buy", tokenAddress, fromAmount, false, result.error)
          const parsedError = parseTransactionError(result.error || new Error("Unknown error"))
          logError(result.error || new Error("Unknown error"), "SwapInterface.buy")

          if (isSlippageError(result.error)) {
            setSlippageError(parsedError.userFriendlyMessage)
            toast.error(
              parsedError.suggestion
                ? `${parsedError.userFriendlyMessage}: ${parsedError.suggestion}`
                : parsedError.userFriendlyMessage,
              {
                duration: 5000,
              },
            )
          } else {
            const details = parsedError.suggestion || parsedError.message
            toast.error(
              details
                ? `${parsedError.userFriendlyMessage}: ${details}`
                : parsedError.userFriendlyMessage,
              {
                duration: 5000,
              },
            )
          }
        }
      } catch (error) {
        const parsedError = parseTransactionError(error)
        logError(error, "SwapInterface.buy")
        trackTrade("buy", tokenAddress, fromAmount, false, parsedError.message)

        if (isSlippageError(error)) {
          setSlippageError(parsedError.userFriendlyMessage)
          toast.error(
            parsedError.suggestion
              ? `${parsedError.userFriendlyMessage}: ${parsedError.suggestion}`
              : parsedError.userFriendlyMessage,
            {
              duration: 5000,
            },
          )
        } else {
          const details = parsedError.suggestion || parsedError.message
          toast.error(
            details
              ? `${parsedError.userFriendlyMessage}: ${details}`
              : parsedError.userFriendlyMessage,
            {
              duration: 5000,
            },
          )
        }
      } finally {
        setIsTrading(false)
      }
    } else if (activeTab === "sell") {
      // Validate token balance
      if (!tokenBalance || parseFloat(tokenBalance) < parseFloat(fromAmount)) {
        const errorMsg = `Insufficient token balance. You have ${tokenBalance || "0"} ${tokenSymbol}, but need ${fromAmount} ${tokenSymbol}.`
        setBalanceError(errorMsg)
        toast.error(
          `Insufficient token balance: You have ${tokenBalance || "0"} ${tokenSymbol}`,
          {
            duration: 4000,
          },
        )
        logError(new Error(errorMsg), "SwapInterface")
        return
      }
      setBalanceError(null)

      // Validate amount > 0
      if (parseFloat(fromAmount) <= 0) {
        toast.error("Amount must be greater than 0", {
          duration: 3000,
        })
        return
      }

      // Run Tenderly simulation before sending real transaction
      setSimulationStatus(null)
      setSimulationError(null)
      setIsSimulatingTx(true)
      try {
        const tokenWeiIn = parseEther(fromAmount)
        const wrapperAmount = tokenWeiIn / (10n ** 12n)
        if (wrapperAmount <= 0n) {
          throw new Error("Amount too small for current bonding curve")
        }

        const baseProceeds = calculateBondingCurveSellProceeds(curveParams, wrapperAmount)
        if (baseProceeds <= 0n) {
          throw new Error("Amount too small for current bonding curve")
        }

        const slippagePercentLocal = parseFloat(slippage) || 1
        const fee = (baseProceeds * FEE_BPS) / BPS_DENOMINATOR
        const netProceeds = baseProceeds - fee
        const slippageBps = BigInt(Math.floor(slippagePercentLocal * 100))
        const minProceeds = netProceeds * (BPS_DENOMINATOR - slippageBps) / BPS_DENOMINATOR
        const minIpOutStr = formatEther(minProceeds)

        await launchpadService.simulateSell(
          tokenAddress,
          fromAmount,
          minIpOutStr,
          primaryWallet.address as string,
        )
        // Simulation passed; proceed silently to on-chain execution
      } catch (simError: any) {
        const message = simError?.message || "Simulation failed"
        logger.error("Tenderly simulation error (sell)", simError)
        const lower = message.toLowerCase()
        const isRateLimited = lower.includes("429") || simError?.status === 429
        const isMethodMissing =
          lower.includes("tenderly_simulate") ||
          lower.includes("does not exist") ||
          lower.includes("is not available")

        if (isRateLimited || isMethodMissing) {
          setSimulationError(
            "Tenderly simulation is unavailable. Proceeding without preview."
          )
          toast.error(`Simulation unavailable: ${message}`, {
            duration: 5000,
          })
        } else {
          setSimulationError(message)
          toast.error(`Simulation failed: ${message}`, {
            duration: 5000,
          })
          setIsSimulatingTx(false)
          return
        }
      }
      setIsSimulatingTx(false)

      // Proceed with sell using launchpadService.sell (which manages approvals internally)
      await handleSell()
    }
  }

  // Handle sell transaction
  const handleSell = async () => {
    if (!tokenAddress || !primaryWallet || !fromAmount) return

    setIsTrading(true)
    setTradeSuccess(false)

    // Calculate slippage percent first
    const slippagePercent = parseFloat(slippage) || 1

    // Track trade initiation
    trackEvent("trade_initiated", {
      type: "sell",
      tokenAddress,
      amount: fromAmount,
      slippage: slippagePercent,
    })

    try {
      // Calculate minIpOut using real bonding curve math, matching SovryLaunchpad.sell
      const tokenWeiIn = parseEther(fromAmount)
      const wrapperAmount = tokenWeiIn / (10n ** 12n)
      if (wrapperAmount <= 0n) {
        toast.error("Amount too small for current bonding curve", {
          duration: 3000,
        })
        return
      }

      const baseProceeds = calculateBondingCurveSellProceeds(curveParams, wrapperAmount)
      if (baseProceeds <= 0n) {
        toast.error("Amount too small for current bonding curve", {
          duration: 3000,
        })
        return
      }

      const fee = (baseProceeds * FEE_BPS) / BPS_DENOMINATOR
      const netProceeds = baseProceeds - fee
      const slippageBps = BigInt(Math.floor(slippagePercent * 100))
      const minProceeds = netProceeds * (BPS_DENOMINATOR - slippageBps) / BPS_DENOMINATOR
      const minIpOutStr = formatEther(minProceeds)

      const { launchpadService } = await import("@/services/launchpadService")
      const result = await launchpadService.sell(tokenAddress, fromAmount, minIpOutStr, primaryWallet)

      if (result.success) {
        setTradeSuccess(true)
        trackTrade("sell", tokenAddress, fromAmount, true)
        toast.success("Trade Successful!", {
          duration: 2000,
          icon: "✅",
        })

        // Refresh balances after successful trade
        if (primaryWallet?.address) {
          setTimeout(() => {
            const event = new CustomEvent("refresh-balances")
            window.dispatchEvent(event)
          }, 2000)
        }

        // Trigger recent activity refresh for this token
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("refresh-trades", {
              detail: { tokenAddress },
            })
          )
        }

        // Reset form after 2 seconds
        setTimeout(() => {
          setFromAmount("")
          setToAmount("")
          setPriceImpact(null)
          setExchangeRate("")
          setTradeSuccess(false)
        }, 2000)
      } else {
        trackTrade("sell", tokenAddress, fromAmount, false, result.error)
        const parsedError = parseTransactionError(result.error || new Error("Unknown error"))
        logError(result.error || new Error("Unknown error"), "SwapInterface.sell")

        if (isSlippageError(result.error)) {
          setSlippageError(parsedError.userFriendlyMessage)
          toast.error(
            parsedError.suggestion
              ? `${parsedError.userFriendlyMessage}: ${parsedError.suggestion}`
              : parsedError.userFriendlyMessage,
            {
              duration: 5000,
            },
          )
        } else {
          const details = parsedError.suggestion || parsedError.message
          toast.error(
            details
              ? `${parsedError.userFriendlyMessage}: ${details}`
              : parsedError.userFriendlyMessage,
            {
              duration: 5000,
            },
          )
        }
      }
    } catch (error) {
      const parsedError = parseTransactionError(error)
      logError(error, "SwapInterface.sell")
      trackTrade("sell", tokenAddress, fromAmount, false, parsedError.message)
      
      if (isSlippageError(error)) {
        setSlippageError(parsedError.userFriendlyMessage)
        toast.error(
          parsedError.suggestion
            ? `${parsedError.userFriendlyMessage}: ${parsedError.suggestion}`
            : parsedError.userFriendlyMessage,
          {
            duration: 5000,
          },
        )
      } else {
        const details = parsedError.suggestion || parsedError.message
        toast.error(
          details
            ? `${parsedError.userFriendlyMessage}: ${details}`
            : parsedError.userFriendlyMessage,
          {
            duration: 5000,
          },
        )
      }
    } finally {
      setIsTrading(false)
    }
  }

  // Get PiperX DEX URL
  const getPiperXDEXUrl = () => {
    if (piperXPoolAddress) {
      return `https://piperx.io/pool/${piperXPoolAddress}`
    }
    if (tokenAddress) {
      return `https://piperx.io/token/${tokenAddress}`
    }
    return "https://piperx.io"
  }

  const handleTradeOnPiperX = () => {
    window.open(getPiperXDEXUrl(), "_blank", "noopener,noreferrer")
  }

  // If graduated, show disabled state with message
  if (isGraduated) {
    return (
      <Card className={cn("overflow-hidden", className)}>
        <CardHeader className="border-b border-border bg-muted/60">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                Trade Console
              </div>
              <h3 className="text-lg font-semibold text-foreground">Swap</h3>
            </div>
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
              Graduated
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="default" className="border-border bg-muted/40">
            <AlertTriangle className="h-4 w-4 text-secondary" />
            <AlertDescription className="text-muted-foreground">
              This token has graduated to PiperX
            </AlertDescription>
          </Alert>
          <Button
            onClick={handleTradeOnPiperX}
            className="w-full h-12 font-mono text-xs uppercase tracking-[0.2em] bg-primary text-primary-foreground hover:bg-primary/90 touch-manipulation min-h-[44px]"
          >
            <ExternalLink className="h-5 w-5 mr-2" />
            Trade on PiperX
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="border-b border-border bg-muted/60">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
              Trade Console
            </div>
            <h3 className="text-lg font-semibold text-foreground">Swap</h3>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 border border-border text-muted-foreground hover:text-foreground hover:bg-muted/60"
            onClick={() => {
              setShowSlippageSettings(true)
              trackEvent("slippage_changed", { action: "open_settings" })
            }}
            aria-label="Slippage settings"
            title="Slippage tolerance settings"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>

        {/* Slippage Display */}
        <div className="flex items-center justify-end">
          <button
            onClick={() => setShowSlippageSettings(true)}
            className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Slippage tolerance settings"
          >
            Slippage: <span className="text-foreground tabular-nums">{slippage}%</span>
          </button>
        </div>

        {/* Buy/Sell Tabs */}
        <Tabs value={activeTab} onValueChange={handleTabChange} className="mt-4">
          <TabsList className="grid w-full grid-cols-2 rounded-sm border border-border bg-background/40 p-1">
            <TabsTrigger
              value="buy"
              className={cn(
                "rounded-sm text-[11px] font-mono uppercase tracking-[0.2em] text-muted-foreground",
                "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground",
                "data-[state=active]:hover:bg-primary/90"
              )}
              aria-label="Buy tokens"
            >
              Buy
            </TabsTrigger>
            <TabsTrigger
              value="sell"
              className={cn(
                "rounded-sm text-[11px] font-mono uppercase tracking-[0.2em] text-muted-foreground",
                "data-[state=active]:bg-secondary data-[state=active]:text-secondary-foreground",
                "data-[state=active]:hover:bg-secondary/90"
              )}
              aria-label="Sell tokens"
            >
              Sell
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* You Pay Section */}
        <div className="space-y-2">
          <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">You Pay</label>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              type="text"
              value={fromAmount}
              onChange={(e) => {
                setFromAmount(e.target.value)
                // Clear errors when user types
                setBalanceError(null)
                setSlippageError(null)
                // Calculation will be handled by debounced effect
              }}
              onKeyDown={(e) => {
                // Allow: backspace, delete, tab, escape, enter, decimal point
                if ([8, 9, 27, 13, 46, 110, 190].indexOf(e.keyCode) !== -1 ||
                    // Allow: Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
                    (e.keyCode === 65 && e.ctrlKey === true) ||
                    (e.keyCode === 67 && e.ctrlKey === true) ||
                    (e.keyCode === 86 && e.ctrlKey === true) ||
                    (e.keyCode === 88 && e.ctrlKey === true) ||
                    // Allow: home, end, left, right
                    (e.keyCode >= 35 && e.keyCode <= 39)) {
                  return
                }
                // Ensure that it is a number and stop the keypress
                if ((e.shiftKey || (e.keyCode < 48 || e.keyCode > 57)) && (e.keyCode < 96 || e.keyCode > 105)) {
                  e.preventDefault()
                }
              }}
              placeholder={detailsLoading ? "Loading..." : "0.0"}
              disabled={detailsLoading || !tokenAddress || isTrading}
              className="flex-1 text-base sm:text-lg font-semibold font-mono tabular-nums"
              aria-label={`Amount to ${activeTab === "buy" ? "spend" : "sell"}`}
              aria-describedby={balanceError ? "balance-error" : undefined}
            />
          </div>
          {/* Balance Display - Stack below on mobile */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1 sm:gap-2 pt-1">
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
              Balance:{" "}
              <span className="text-foreground tabular-nums">
                {activeTab === "buy" 
                  ? formatBalance(userBalance, 4)
                  : formatBalance(tokenBalance, 4)
                } {activeTab === "buy" ? "IP" : tokenSymbol}
              </span>
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                const balance = activeTab === "buy" ? userBalance : tokenBalance
                if (balance && parseFloat(balance) > 0) {
                  setFromAmount(parseFloat(balance).toString())
                }
              }}
              disabled={!isConnected || (activeTab === "buy" ? !userBalance : !tokenBalance)}
              className="h-6 px-2 text-[10px] font-mono uppercase tracking-[0.2em] text-primary hover:text-primary/80 hover:bg-primary/10"
              aria-label="Set maximum balance"
            >
              MAX
            </Button>
          </div>
        </div>

        {/* Estimated Receive */}
        <div className="space-y-2">
          <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Estimated Receive</label>
          <div className="flex items-center justify-between rounded-sm border border-border bg-muted/30 px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold font-mono tabular-nums">
                {toAmount || (isCalculating ? "…" : "0.0")}
              </span>
              <span className="text-[11px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                {activeTab === "buy" ? tokenSymbol : "IP"}
              </span>
            </div>
            {isCalculating && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
          {minReceive && (
            <div className="pt-1">
              <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                Min received ({slippage}% slippage):{ " " }
                <span className="text-foreground tabular-nums">
                  {minReceive} {activeTab === "buy" ? tokenSymbol : "IP"}
                </span>
              </span>
            </div>
          )}
        </div>

        {/* Exchange Rate and Price Impact */}
        {(exchangeRate || priceImpact !== null) && (
          <div className="pt-3 border-t border-border space-y-2">
            {exchangeRate && (
              <p className="text-[11px] font-mono text-muted-foreground text-center">{exchangeRate}</p>
            )}
            {priceImpact !== null && priceImpact > 0 && (
              <div className="flex items-center justify-center gap-2">
                <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                  Price Impact
                </span>
                <span
                  className={cn(
                    "text-[11px] font-mono tabular-nums",
                    priceImpact > 5 ? "text-secondary" : "text-foreground"
                  )}
                >
                  {priceImpact.toFixed(2)}%
                </span>
                {priceImpact > 5 && (
                  <AlertTriangle className="h-3 w-3 text-secondary" aria-hidden="true" />
                )}
              </div>
            )}
            {priceImpact !== null && priceImpact > 5 && (
              <Alert variant="destructive" className="py-2 border-secondary/40 bg-secondary/10" role="alert">
                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                <AlertDescription className="text-[11px] text-secondary">
                  High price impact! This trade will significantly affect the token price.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* Error Messages */}
        {balanceError && (
          <Alert variant="destructive" className="py-2 border-secondary/40 bg-secondary/10">
            <AlertTriangle className="h-3 w-3" />
            <AlertDescription className="text-[11px] text-secondary">
              {balanceError}
            </AlertDescription>
          </Alert>
        )}

        {slippageError && (
          <Alert variant="destructive" className="py-2 border-secondary/40 bg-secondary/10">
            <AlertTriangle className="h-3 w-3" />
            <AlertDescription className="text-[11px] text-secondary">
              {slippageError}
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 ml-1 text-[10px] font-mono uppercase tracking-[0.2em] text-secondary underline"
                onClick={() => setShowSlippageSettings(true)}
              >
                Increase slippage
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Simulation feedback */}
        {simulationStatus && (
          <Alert className="mt-2 border-primary/40 bg-primary/10">
            <CheckCircle className="h-3 w-3 text-primary" />
            <AlertDescription className="text-[11px] font-mono text-primary">
              {simulationStatus}
            </AlertDescription>
          </Alert>
        )}
        {simulationError && (
          <Alert variant="destructive" className="mt-2 py-2 border-secondary/40 bg-secondary/10">
            <AlertTriangle className="h-3 w-3" />
            <AlertDescription className="text-[11px] text-secondary">
              {simulationError}
            </AlertDescription>
          </Alert>
        )}

        {/* Single trade button: simulate on Tenderly, then execute on-chain */}
        <div className="mt-3 flex flex-col gap-2">
          <Button
            onClick={handlePlaceTrade}
            disabled={
              !fromAmount ||
              parseFloat(fromAmount) <= 0 ||
              !isConnected ||
              isTrading ||
              isSimulatingTx ||
              detailsLoading ||
              !tokenAddress ||
              !!balanceError
            }
            className={cn(
              "w-full h-12 sm:h-12 font-semibold font-mono text-sm tracking-[0.08em] touch-manipulation min-h-[44px]",
              "shadow-[0_0_0_rgba(204,255,0,0)] transition-shadow duration-200",
              activeTab === "buy"
                ? "bg-primary hover:bg-primary/90 text-primary-foreground disabled:opacity-60 hover:shadow-[0_0_24px_rgba(204,255,0,0.35)]"
                : "bg-secondary hover:bg-secondary/90 text-secondary-foreground disabled:opacity-60 hover:shadow-[0_0_24px_rgba(204,255,0,0.35)]"
            )}
          >
            {isSimulatingTx ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Simulating on Tenderly...
              </>
            ) : isTrading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {simulationError ? "Confirming (no preview)" : "Confirming..."}
              </>
            ) : tradeSuccess ? (
              <>
                <CheckCircle className="h-4 w-4 mr-2" />
                Trade Successful!
              </>
            ) : !isConnected ? (
              "Connect Wallet"
            ) : simulationError ? (
              "Retry (simulation failed)"
            ) : (
              "Place Trade"
            )}
          </Button>
        </div>
      </CardContent>

      {/* Slippage Settings Dialog */}
      <SlippageSettings
        open={showSlippageSettings}
        onOpenChange={setShowSlippageSettings}
        slippage={slippage}
        onSlippageChange={setSlippage}
      />
    </Card>
  )
}

// Memoize component to prevent unnecessary re-renders
export const SwapInterface = memo(SwapInterfaceComponent, (prevProps, nextProps) => {
  // Only re-render if these props change
  return (
    prevProps.tokenAddress === nextProps.tokenAddress &&
    prevProps.tokenSymbol === nextProps.tokenSymbol &&
    prevProps.isGraduated === nextProps.isGraduated &&
    prevProps.piperXPoolAddress === nextProps.piperXPoolAddress
  )
})

SwapInterface.displayName = "SwapInterface"
