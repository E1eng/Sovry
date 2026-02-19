"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { useDynamicContext } from "@dynamic-labs/sdk-react-core"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
// Alerts replaced with inline divs for consistent sizing
import { Settings, Loader2, AlertTriangle, CheckCircle, ExternalLink } from "lucide-react"
import { parseEther, formatEther, formatUnits } from "viem"
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
import { launchpadService } from "@/services/launchpadService"
import { getPiperXDexUrl } from "@/lib/piperx"

type TradeTab = "buy" | "sell" | "redeem"

function trimToDecimals(value: string, maxDecimals: number): string {
  if (!value || maxDecimals < 0) return value
  const dot = value.indexOf(".")
  if (dot === -1) return value
  const integer = value.slice(0, dot)
  const decimals = value.slice(dot + 1)
  const trimmed = decimals.slice(0, maxDecimals).replace(/0+$/, "")
  return trimmed.length > 0 ? `${integer}.${trimmed}` : integer
}

function formatDisplayAmount(value: string, fractionDigits: number = 2): string {
  if (!value) return "0.00"
  const num = parseFloat(value)
  if (!isFinite(num)) return "0.00"
  return num.toLocaleString(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })
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
  mode?: "trade" | "redeem"
  onSwap?: (direction: "buy" | "sell", amount: string) => void
  isGraduated?: boolean
  piperXPoolAddress?: string
}

function SwapInterfaceComponent({
  tokenAddress,
  tokenSymbol = "TOKEN",
  className,
  mode = "trade",
  onSwap: _onSwap,
  isGraduated = false,
  piperXPoolAddress,
}: SwapInterfaceProps) {
  const [activeTab, setActiveTab] = useState<TradeTab>(() => (mode === "redeem" ? "redeem" : "buy"))
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
  const [rtBalance, setRtBalance] = useState<string | null>(null)
  const [minReceive, setMinReceive] = useState<string | null>(null)
  const [balanceError, setBalanceError] = useState<string | null>(null)
  const [slippageError, setSlippageError] = useState<string | null>(null)
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
    async (amount: string, tab: TradeTab) => {
      if (!amount || parseFloat(amount) <= 0 || !tokenAddress || tokenDataLoading || !tokenData) {
        setToAmount("")
        setMinReceive(null)
        setPriceImpact(null)
        setExchangeRate("")
        return
      }

      setIsCalculating(true)

      try {
        const amountBigInt = parseEther(amount)

        if (tab === "redeem") {
          const supplyBefore = tokenData.totalSupply
          const totalLocked = tokenData.totalLocked

          if (supplyBefore <= 0n || totalLocked <= 0n || amountBigInt <= 0n) {
            setToAmount("")
            setMinReceive(null)
            setPriceImpact(null)
            setExchangeRate("")
            return
          }

          const rtOut = (amountBigInt * totalLocked) / supplyBefore
          const rtOutFormatted = formatUnits(rtOut, 6)

          setToAmount(formatDisplayAmount(rtOutFormatted, 4))
          setMinReceive(null)
          setPriceImpact(null)

          const rate = parseFloat(rtOutFormatted) / parseFloat(amount)
          setExchangeRate(`1 ${tokenSymbol} = ${Number.isFinite(rate) ? rate.toFixed(6) : "—"} RT`)
          return
        }

        const paramsForQuote = curveParams
        if (!paramsForQuote) {
          setToAmount("")
          setMinReceive(null)
          setPriceImpact(null)
          setExchangeRate("")
          return
        }

        let impact: number
        if (tab === "buy") {
          const { amount: tokenAmount, totalCost } = estimateBuyAmountForIp(paramsForQuote, amountBigInt)
          if (tokenAmount === 0n || totalCost === 0n) {
            setToAmount("")
            setMinReceive(null)
            setPriceImpact(null)
            setExchangeRate("")
            return
          }

          // Wrapper token uses 18 decimals; amount is already in wei
          const expectedTokensStr = formatEther(tokenAmount)
          const expectedTokens = parseFloat(expectedTokensStr)

          // Display expected tokens received
          setToAmount(formatDisplayAmount(expectedTokensStr, 2))

          const slippagePercent = parseFloat(slippage) || 0.5
          const slippageBps = BigInt(Math.floor(slippagePercent * 100))
          const minTokenWei = tokenAmount * (BPS_DENOMINATOR - slippageBps) / BPS_DENOMINATOR
          setMinReceive(formatDisplayAmount(formatEther(minTokenWei), 2))

          impact = calculateRealPriceImpact(paramsForQuote, tokenAmount, true)
          const rate = expectedTokens / parseFloat(amount)
          setExchangeRate(`1 IP = ${rate.toFixed(6)} ${tokenSymbol}`)
        } else {
          // SELL: wrapper token uses 18 decimals; UI amount is already wei
          const wrapperAmount = amountBigInt
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

          setToAmount(formatDisplayAmount(expectedIpOutStr, 2))
          setMinReceive(formatDisplayAmount(minIpOutStr, 2))

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
        calculateOutput(fromAmount, activeTab)
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
      calculateOutput(debouncedFromAmount, activeTab)
    }, 10000) // 10s refresh

    return () => clearInterval(interval)
  }, [debouncedFromAmount, activeTab, tokenAddress, calculateOutput])

  // Handle tab change - direction is always IP -> TOKEN for buy, TOKEN -> IP for sell
  const handleTabChange = (value: string) => {
    const newTab = value as TradeTab
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
        // Wrapper token uses 18 decimals.
        const balance = await publicClient.readContract({
          address: tokenAddress as `0x${string}`,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [primaryWallet.address as `0x${string}`],
        }) as bigint

        setTokenBalance(formatEther(balance))
      } catch (error) {
        logger.error("Error fetching token balance/approval:", error)
        setTokenBalance(null)
      }
    }

    fetchTokenBalance()
  }, [primaryWallet?.address, tokenAddress, publicClient, balanceRefreshNonce])

  // Fetch user's RT balance (for redeem)
  useEffect(() => {
    const fetchRtBalance = async () => {
      if (mode !== "redeem") {
        setRtBalance(null)
        return
      }
      if (!primaryWallet?.address || !tokenData?.rtAddress) {
        setRtBalance(null)
        return
      }

      try {
        const rtAddr = tokenData.rtAddress
        if (!rtAddr || rtAddr === "0x0000000000000000000000000000000000000000") {
          setRtBalance(null)
          return
        }

        const balance = await publicClient.readContract({
          address: rtAddr as `0x${string}`,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [primaryWallet.address as `0x${string}`],
        }) as bigint

        setRtBalance(formatUnits(balance, 6))
      } catch (error) {
        logger.error("Error fetching RT balance:", error)
        setRtBalance(null)
      }
    }

    fetchRtBalance()
  }, [mode, primaryWallet?.address, tokenData?.rtAddress, publicClient, balanceRefreshNonce])

  const resetAfterSuccess = () => {
    setTimeout(() => {
      setFromAmount("")
      setToAmount("")
      setPriceImpact(null)
      setExchangeRate("")
      setMinReceive(null)
      setTradeSuccess(false)
    }, 2000)
  }

  const dispatchPostTxRefresh = () => {
    if (typeof window === "undefined") return

    // Balances are a little async post-tx (indexing / RPC), so refresh with a delay.
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("refresh-balances"))
    }, 2000)

    window.dispatchEvent(
      new CustomEvent("refresh-trades", {
        detail: { tokenAddress },
      })
    )
  }

  // Handle place trade
  const handlePlaceTrade = async () => {
    if (!fromAmount || parseFloat(fromAmount) <= 0 || !tokenAddress) return

    if (tokenDataLoading || !tokenData) {
      toast.error("Token state unavailable", { duration: 3000 })
      return
    }

    if ((activeTab === "buy" || activeTab === "sell") && (!tokenData.isActive || !curveParams)) {
      toast.error("Bonding curve is inactive (token may have graduated)", { duration: 3000 })
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
      const actualTokensOutFormatted = parseFloat(formatEther(tokenAmount))
      const minTokensOut = actualTokensOutFormatted * (1 - slippagePercent / 100)

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

          dispatchPostTxRefresh()
          resetAfterSuccess()
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

      // Proceed with sell using launchpadService.sell (which manages approvals internally)
      await handleSell()
    } else if (activeTab === "redeem") {
      // Validate wrapper token balance
      if (!tokenBalance || parseFloat(tokenBalance) < parseFloat(fromAmount)) {
        const errorMsg = `Insufficient token balance. You have ${tokenBalance || "0"} ${tokenSymbol}, but need ${fromAmount} ${tokenSymbol}.`
        setBalanceError(errorMsg)
        toast.error(`Insufficient token balance: You have ${tokenBalance || "0"} ${tokenSymbol}`, {
          duration: 4000,
        })
        logError(new Error(errorMsg), "SwapInterface")
        return
      }

      setBalanceError(null)

      await handleRedeem()
    }
  }

  // Handle sell transaction
  const handleSell = async () => {
    if (!tokenAddress || !primaryWallet || !fromAmount) return

    if (!curveParams) {
      toast.error("Token state unavailable or inactive", { duration: 3000 })
      return
    }

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
      const wrapperAmount = parseEther(fromAmount)
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

      const result = await launchpadService.sell(tokenAddress, fromAmount, minIpOutStr, primaryWallet)

      if (result.success) {
        setTradeSuccess(true)
        trackTrade("sell", tokenAddress, fromAmount, true)
        toast.success("Trade Successful!", {
          duration: 2000,
          icon: "✅",
        })

        dispatchPostTxRefresh()
        resetAfterSuccess()
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

  const handleRedeem = async () => {
    if (!tokenAddress || !primaryWallet || !fromAmount) return

    setIsTrading(true)
    setTradeSuccess(false)

    trackEvent("redeem_initiated", {
      tokenAddress,
      amount: fromAmount,
    })

    try {
      const result = await launchpadService.redeem(tokenAddress, fromAmount, primaryWallet)

      if (result.success) {
        setTradeSuccess(true)
        trackEvent("redeem", {
          tokenAddress,
          amount: fromAmount,
          success: true,
        })

        toast.success("Redeem Successful!", {
          duration: 2000,
          icon: "✅",
        })

        dispatchPostTxRefresh()
        resetAfterSuccess()
      } else {
        const parsedError = parseTransactionError(result.error || new Error("Unknown error"))
        logError(result.error || new Error("Unknown error"), "SwapInterface.redeem")
        trackEvent("redeem", {
          tokenAddress,
          amount: fromAmount,
          success: false,
          error: parsedError.message,
        })

        const details = parsedError.suggestion || parsedError.message
        toast.error(
          details ? `${parsedError.userFriendlyMessage}: ${details}` : parsedError.userFriendlyMessage,
          {
            duration: 5000,
          },
        )
      }
    } catch (error) {
      const parsedError = parseTransactionError(error)
      logError(error, "SwapInterface.redeem")
      trackEvent("redeem", {
        tokenAddress,
        amount: fromAmount,
        success: false,
        error: parsedError.message,
      })

      const details = parsedError.suggestion || parsedError.message
      toast.error(details ? `${parsedError.userFriendlyMessage}: ${details}` : parsedError.userFriendlyMessage, {
        duration: 5000,
      })
    } finally {
      setIsTrading(false)
    }
  }

  const handleTradeOnPiperX = () => {
    window.open(
      getPiperXDexUrl({
        poolAddress: piperXPoolAddress,
        tokenAddress,
      }),
      "_blank",
      "noopener,noreferrer",
    )
  }

  const fromBalance = activeTab === "buy" ? userBalance : tokenBalance
  const fromSymbol = activeTab === "buy" ? "IP" : tokenSymbol
  const receiveSymbol = activeTab === "buy" ? tokenSymbol : activeTab === "sell" ? "IP" : "RT"

  return (
    <Card className={cn("overflow-hidden", className)}>
      <div className="border-b border-border bg-muted/40 px-4 py-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-foreground">{mode === "redeem" ? "Redeem" : "Swap"}</span>
          {mode === "trade" && isGraduated ? (
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Graduated</span>
          ) : mode === "trade" ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSlippageSettings(true)}
                className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Slippage tolerance settings"
              >
                Slip: <span className="text-foreground tabular-nums">{slippage}%</span>
              </button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 border border-border text-muted-foreground hover:text-foreground hover:bg-muted/60"
                onClick={() => {
                  setShowSlippageSettings(true)
                  trackEvent("slippage_changed", { action: "open_settings" })
                }}
                aria-label="Slippage settings"
                title="Slippage tolerance settings"
              >
                <Settings className="h-3 w-3" />
              </Button>
            </div>
          ) : null}
        </div>

        {/* Buy/Sell Tabs */}
        {mode === "trade" && !isGraduated && (
          <Tabs value={activeTab} onValueChange={handleTabChange} className="mt-2.5">
            <TabsList className="grid w-full grid-cols-2 rounded-sm border border-border bg-background/40 p-0.5">
              <TabsTrigger
                value="buy"
                className={cn(
                  "rounded-sm text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground py-1.5",
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
                  "rounded-sm text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground py-1.5",
                  "data-[state=active]:bg-secondary data-[state=active]:text-secondary-foreground",
                  "data-[state=active]:hover:bg-secondary/90"
                )}
                aria-label="Sell tokens"
              >
                Sell
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}
      </div>

      <CardContent className="p-3 space-y-2">
        {mode === "trade" && isGraduated && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 rounded-sm border border-border bg-muted/30 px-2.5 py-2">
              <AlertTriangle className="h-3 w-3 text-secondary flex-shrink-0" />
              <span className="text-[10px] font-mono text-muted-foreground">This token has graduated to PiperX</span>
            </div>
            <Button
              onClick={handleTradeOnPiperX}
              className="w-full h-10 font-mono text-xs uppercase tracking-[0.2em] bg-primary text-primary-foreground hover:bg-primary/90 touch-manipulation"
            >
              <ExternalLink className="h-3.5 w-3.5 mr-2" />
              Trade on PiperX
            </Button>
          </div>
        )}

        {!(mode === "trade" && isGraduated) && (
          <>
            {activeTab === "redeem" && (
              <div className="flex items-center justify-between rounded-sm border border-border/50 bg-muted/20 px-3 py-2">
                <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">RT Balance</span>
                <span className="text-xs font-mono tabular-nums text-foreground">
                  {formatBalance(rtBalance, 4)} RT
                </span>
              </div>
            )}

            {/* You Pay Section */}
            <div className="rounded-sm border border-border/50 bg-muted/20 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">You Pay</label>
                <span className="text-[10px] font-mono text-muted-foreground">
                  Bal:{" "}
                  <span className="text-foreground tabular-nums">
                    {formatBalance(fromBalance, 4)} {fromSymbol}
                  </span>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  value={fromAmount}
                  onChange={(e) => {
                    setFromAmount(e.target.value)
                    setBalanceError(null)
                    setSlippageError(null)
                  }}
                  onKeyDown={(e) => {
                    if ([8, 9, 27, 13, 46, 110, 190].indexOf(e.keyCode) !== -1 ||
                        (e.keyCode === 65 && e.ctrlKey === true) ||
                        (e.keyCode === 67 && e.ctrlKey === true) ||
                        (e.keyCode === 86 && e.ctrlKey === true) ||
                        (e.keyCode === 88 && e.ctrlKey === true) ||
                        (e.keyCode >= 35 && e.keyCode <= 39)) {
                      return
                    }
                    if ((e.shiftKey || (e.keyCode < 48 || e.keyCode > 57)) && (e.keyCode < 96 || e.keyCode > 105)) {
                      e.preventDefault()
                    }
                  }}
                  placeholder={detailsLoading ? "Loading..." : "0.0"}
                  disabled={detailsLoading || !tokenAddress || isTrading}
                  className="h-9 flex-1 text-sm font-mono tabular-nums bg-background/60 border-border/40"
                  aria-label={`Amount to ${activeTab === "buy" ? "spend" : activeTab === "sell" ? "sell" : "redeem"}`}
                  aria-describedby={balanceError ? "balance-error" : undefined}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const balance = activeTab === "buy" ? userBalance : tokenBalance
                    if (balance && parseFloat(balance) > 0) {
                      setFromAmount(parseFloat(balance).toString())
                    }
                  }}
                  disabled={!isConnected || (activeTab === "buy" ? !userBalance : !tokenBalance)}
                  className="h-9 px-3 text-[10px] font-mono uppercase tracking-[0.2em] text-primary border-primary/30 hover:bg-primary/10"
                  aria-label="Set maximum balance"
                >
                  MAX
                </Button>
              </div>
            </div>

            {/* Estimated Receive */}
            <div className="rounded-sm border border-border/50 bg-muted/20 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">You Receive</label>
                {isCalculating && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-mono tabular-nums text-foreground">
                  {toAmount || (isCalculating ? "…" : "0.0")}
                </span>
                <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                  {receiveSymbol}
                </span>
              </div>
              {minReceive && (
                <span className="text-[10px] font-mono text-muted-foreground">
                  Min ({slippage}% slip):{" "}
                  <span className="text-foreground tabular-nums">
                    {minReceive} {receiveSymbol}
                  </span>
                </span>
              )}
            </div>

            {/* Exchange Rate and Price Impact */}
            {(exchangeRate || priceImpact !== null) && (
              <div className="pt-2 border-t border-border/50 space-y-1.5">
                {exchangeRate && (
                  <p className="text-[10px] font-mono text-muted-foreground text-center">{exchangeRate}</p>
                )}
                {priceImpact !== null && priceImpact > 0 && (
                  <div className="flex items-center justify-center gap-1.5">
                    <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Impact</span>
                    <span className={cn("text-[10px] font-mono tabular-nums", priceImpact > 5 ? "text-secondary" : "text-foreground")}>
                      {priceImpact.toFixed(2)}%
                    </span>
                    {priceImpact > 5 && <AlertTriangle className="h-2.5 w-2.5 text-secondary flex-shrink-0" aria-hidden="true" />}
                  </div>
                )}
                {priceImpact !== null && priceImpact > 5 && (
                  <div className="flex items-center gap-1.5 rounded-sm border border-secondary/30 bg-secondary/5 px-2.5 py-1.5" role="alert">
                    <AlertTriangle className="h-3 w-3 text-secondary flex-shrink-0" aria-hidden="true" />
                    <span className="text-[10px] font-mono text-secondary">High price impact!</span>
                  </div>
                )}
              </div>
            )}

            {/* Error Messages */}
            {balanceError && (
              <div className="flex items-center gap-1.5 rounded-sm border border-secondary/30 bg-secondary/5 px-2.5 py-1.5">
                <AlertTriangle className="h-3 w-3 text-secondary flex-shrink-0" />
                <span className="text-[10px] font-mono text-secondary">{balanceError}</span>
              </div>
            )}

            {slippageError && (
              <div className="flex items-center gap-1.5 rounded-sm border border-secondary/30 bg-secondary/5 px-2.5 py-1.5">
                <AlertTriangle className="h-3 w-3 text-secondary flex-shrink-0" />
                <span className="text-[10px] font-mono text-secondary">
                  {slippageError}
                  <button type="button" className="ml-1 underline hover:no-underline" onClick={() => setShowSlippageSettings(true)}>Increase slippage</button>
                </span>
              </div>
            )}

            {/* Trade button */}
            <Button
              onClick={handlePlaceTrade}
              disabled={!fromAmount || parseFloat(fromAmount) <= 0 || !isConnected || isTrading || detailsLoading || !tokenAddress || !!balanceError}
              className={cn(
                "w-full h-10 font-mono text-xs uppercase tracking-[0.2em] touch-manipulation",
                "shadow-[0_0_0_rgba(204,255,0,0)] transition-shadow duration-200",
                activeTab === "buy"
                  ? "bg-primary hover:bg-primary/90 text-primary-foreground disabled:opacity-60 hover:shadow-[0_0_24px_rgba(204,255,0,0.35)]"
                  : activeTab === "sell"
                    ? "bg-secondary hover:bg-secondary/90 text-secondary-foreground disabled:opacity-60 hover:shadow-[0_0_24px_rgba(204,255,0,0.35)]"
                    : "bg-foreground hover:bg-foreground/90 text-background disabled:opacity-60 hover:shadow-[0_0_24px_rgba(204,255,0,0.22)]"
              )}
            >
              {isTrading ? (
                <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Confirming...</>
              ) : tradeSuccess ? (
                <><CheckCircle className="h-3.5 w-3.5 mr-1.5" />Success!</>
              ) : !isConnected ? (
                "Connect Wallet"
              ) : (
                activeTab === "redeem" ? "Redeem" : "Place Trade"
              )}
            </Button>
          </>
        )}
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
    (prevProps.mode ?? "trade") === (nextProps.mode ?? "trade") &&
    prevProps.isGraduated === nextProps.isGraduated &&
    prevProps.piperXPoolAddress === nextProps.piperXPoolAddress
  )
})

SwapInterface.displayName = "SwapInterface"
