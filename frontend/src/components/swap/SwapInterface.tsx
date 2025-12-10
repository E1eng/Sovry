"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { useDynamicContext } from "@dynamic-labs/sdk-react-core"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ArrowDownUp, Settings, Loader2, AlertTriangle, CheckCircle, ExternalLink } from "lucide-react"
import { parseEther, formatEther } from "viem"
import { createPublicClient, http } from "viem"
import toast from "react-hot-toast"
import { cn } from "@/lib/utils"
import { useLaunchDetails } from "@/hooks/useLaunchDetails"
import {
  estimateBuyAmountForIp,
  calculateRealPriceImpact,
  calculateBondingCurveSellProceeds,
} from "@/lib/bondingCurve"
import { SlippageSettings } from "@/components/swap/SlippageSettings"
import { launchpadService } from "@/services/launchpadService"
import { erc20Abi } from "viem"
import { parseTransactionError, logError, isSlippageError } from "@/lib/errorUtils"
import { trackTrade, trackEvent } from "@/lib/analytics"
import { memo, useEffect as useReactEffect } from "react"

export interface SwapInterfaceProps {
  tokenAddress?: string
  tokenSymbol?: string
  className?: string
  onSwap?: (fromToken: string, toToken: string, amount: string) => void
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
  const [fromToken, setFromToken] = useState<"IP" | "TOKEN">(activeTab === "buy" ? "IP" : "TOKEN")
  const [toToken, setToToken] = useState<"IP" | "TOKEN">(activeTab === "buy" ? "TOKEN" : "IP")
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
  const [balanceError, setBalanceError] = useState<string | null>(null)
  const [slippageError, setSlippageError] = useState<string | null>(null)
  const [isSimulatingTx, setIsSimulatingTx] = useState(false)
  const [simulationStatus, setSimulationStatus] = useState<string | null>(null)
  const [simulationError, setSimulationError] = useState<string | null>(null)

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
      if (
        !amount ||
        parseFloat(amount) <= 0 ||
        !tokenAddress
      ) {
        setToAmount("")
        setPriceImpact(null)
        setExchangeRate("")
        return
      }

      setIsCalculating(true)

      try {
        const amountBigInt = parseEther(amount)
        let impact: number
        if (isBuy) {
          // Always fetch fresh curve params so the quote matches on-chain
          const freshParams = await launchpadService.getCurveParams(tokenAddress)
          if (!freshParams) {
            setToAmount("")
            setPriceImpact(null)
            setExchangeRate("")
            return
          }

          const { amount: tokenAmount, totalCost } = estimateBuyAmountForIp(freshParams, amountBigInt)
          if (tokenAmount === 0n || totalCost === 0n) {
            setToAmount("")
            setPriceImpact(null)
            setExchangeRate("")
            return
          }

          // Convert 6-decimal wrapper units to 18-decimal token units for display
          const tokenWei = tokenAmount * (10n ** 12n)
          const expectedTokens = parseFloat(formatEther(tokenWei))

          // Keep slippage for internal safety (used when building tx), but
          // show the expected tokens (like Storyscan) in the main UI.
          const slippagePercent = parseFloat(slippage) || 0.5
          const _minOut = expectedTokens * (1 - slippagePercent / 100)

          // Display expected tokens received
          setToAmount(expectedTokens.toFixed(6))

          impact = calculateRealPriceImpact(freshParams, tokenAmount, true)
          const rate = expectedTokens / parseFloat(amount)
          setExchangeRate(`1 IP = ${rate.toFixed(6)} ${toToken}`)
        } else {
          // SELL: convert 18-dec UI amount to 6-dec wrapper units
          const tokenWeiIn = amountBigInt
          const wrapperAmount = tokenWeiIn / (10n ** 12n)
          if (wrapperAmount <= 0n) {
            setToAmount("")
            setPriceImpact(null)
            setExchangeRate("")
            return
          }

          // Always fetch fresh curve params for sell quotes so we reflect
          // the latest on-chain state (tokens sold, currentSupply, etc.)
          const paramsForSell = await launchpadService.getCurveParams(tokenAddress)
          if (!paramsForSell) {
            setToAmount("")
            setPriceImpact(null)
            setExchangeRate("")
            return
          }

          const baseProceeds = calculateBondingCurveSellProceeds(paramsForSell, wrapperAmount)
          if (baseProceeds <= 0n) {
            setToAmount("")
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

          const minIpOutFloat = parseFloat(formatEther(minProceeds))
          setToAmount(minIpOutFloat.toFixed(6))

          impact = calculateRealPriceImpact(paramsForSell, wrapperAmount, false)
          const rate = parseFloat(formatEther(netProceeds)) / parseFloat(amount)
          setExchangeRate(`1 ${fromToken} = ${rate.toFixed(6)} IP`)
        }
        setPriceImpact(impact)
      } catch (error) {
        console.error("Error calculating output:", error)
        setToAmount("")
        setPriceImpact(null)
        setExchangeRate("")
      } finally {
        setIsCalculating(false)
      }
    },
    [tokenAddress, slippage, fromToken, toToken, FEE_BPS, BPS_DENOMINATOR]
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

    if (newTab === "buy") {
      setFromToken("IP")
      setToToken("TOKEN")
    } else {
      setFromToken("TOKEN")
      setToToken("IP")
    }

    // Clear amounts and errors
    setFromAmount("")
    setToAmount("")
    setPriceImpact(null)
    setExchangeRate("")
    setBalanceError(null)
    setSlippageError(null)
  }

  // Handle swap button click: simply toggle between buy and sell directions
  const handleSwapTokens = () => {
    const nextTab = activeTab === "buy" ? "sell" : "buy"
    handleTabChange(nextTab)
  }

  // Create public client for balance checks (memoized)
  const publicClient = useMemo(
    () =>
      createPublicClient({
        chain: {
          id: 1315,
          name: "Story Aeneid Testnet",
          nativeCurrency: { name: "IP", symbol: "IP", decimals: 18 },
          rpcUrls: {
            default: { http: [process.env.NEXT_PUBLIC_STORY_RPC_URL || "https://aeneid.storyrpc.io"] },
          },
        },
        transport: http(process.env.NEXT_PUBLIC_STORY_RPC_URL || "https://aeneid.storyrpc.io"),
      }),
    []
  )

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
        console.error("Error fetching balance:", error)
        setUserBalance(null)
      }
    }

    fetchBalance()
  }, [primaryWallet?.address, publicClient])

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
        console.error("Error fetching token balance/approval:", error)
        setTokenBalance(null)
      }
    }

    fetchTokenBalance()
  }, [primaryWallet?.address, tokenAddress, publicClient])

  // Handle place trade
  const handlePlaceTrade = async () => {
    if (!fromAmount || parseFloat(fromAmount) <= 0 || !tokenAddress) return

    // Validation
    if (!isConnected || !primaryWallet) {
      toast.error("Please connect your wallet", {
        duration: 3000,
      })
      return
    }

    if (activeTab === "buy" && fromToken === "IP") {
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
      const freshParamsForTx = await launchpadService.getCurveParams(tokenAddress)
      if (!freshParamsForTx) {
        toast.error("Bonding curve data not loaded yet. Please wait and try again.", {
          duration: 3000,
        })
        return
      }

      const { amount: tokenAmount } = estimateBuyAmountForIp(freshParamsForTx, ipAmountBigInt)
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
        console.error("Tenderly simulation error (buy)", simError)
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
    } else if (activeTab === "sell" && fromToken === "TOKEN") {
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

        const paramsForSell = await launchpadService.getCurveParams(tokenAddress)
        if (!paramsForSell) {
          throw new Error("Bonding curve not available for this token")
        }

        const baseProceeds = calculateBondingCurveSellProceeds(paramsForSell, wrapperAmount)
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
        console.error("Tenderly simulation error (sell)", simError)
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
      // Create a sell function that only does the sell (not approval)
      // Calculate minIpOut using real bonding curve math, matching SovryLaunchpad.sell
      const tokenWeiIn = parseEther(fromAmount)
      const wrapperAmount = tokenWeiIn / (10n ** 12n)
      if (wrapperAmount <= 0n) {
        toast.error("Amount too small for current bonding curve", {
          duration: 3000,
        })
        return
      }

      const freshParamsForTx = await launchpadService.getCurveParams(tokenAddress)
      if (!freshParamsForTx) {
        toast.error("Bonding curve data not loaded yet. Please wait and try again.", {
          duration: 3000,
        })
        return
      }

      const baseProceeds = calculateBondingCurveSellProceeds(freshParamsForTx, wrapperAmount)
      if (baseProceeds <= 0n) {
        toast.error("Amount too small for current bonding curve", {
          duration: 3000,
        })
        return
      }

      // Apply 1% trading fee: netProceeds = baseProceeds - fee
      const fee = (baseProceeds * FEE_BPS) / BPS_DENOMINATOR
      const netProceeds = baseProceeds - fee

      // Apply slippage in BigInt basis points
      const slippageBps = BigInt(Math.floor(slippagePercent * 100))
      const minProceeds = netProceeds * (BPS_DENOMINATOR - slippageBps) / BPS_DENOMINATOR

      const minIpOutStr = formatEther(minProceeds)

      const result = await launchpadService.sell(
        tokenAddress,
        fromAmount,
        minIpOutStr,
        primaryWallet
      )

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
        <CardHeader className="relative pb-4">
          <h3 className="text-lg font-semibold text-zinc-50">Swap</h3>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="default" className="bg-zinc-800/50 border-zinc-700">
            <AlertTriangle className="h-4 w-4 text-yellow-400" />
            <AlertDescription className="text-zinc-300">
              This token has graduated to PiperX
            </AlertDescription>
          </Alert>
          <Button
            onClick={handleTradeOnPiperX}
            className="w-full h-12 sm:h-12 font-semibold bg-green-500 hover:bg-green-500/90 text-white touch-manipulation min-h-[44px]"
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
      <CardHeader className="relative pb-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-zinc-50">Swap</h3>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => {
              setShowSlippageSettings(true)
              trackEvent("slippage_changed", { action: "open_settings" })
            }}
            aria-label="Slippage settings"
            title="Slippage tolerance settings"
          >
            <Settings className="h-4 w-4 text-zinc-400" />
          </Button>
        </div>

        {/* Slippage Display */}
        <div className="flex items-center justify-end">
          <button
            onClick={() => setShowSlippageSettings(true)}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            aria-label="Slippage tolerance settings"
          >
            Slippage: <span className="text-zinc-300 font-medium">{slippage}%</span>
          </button>
        </div>

        {/* Buy/Sell Tabs */}
        <Tabs value={activeTab} onValueChange={handleTabChange} className="mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger
              value="buy"
              className={cn(
                "data-[state=active]:bg-green-500 data-[state=active]:text-white",
                "data-[state=active]:hover:bg-green-500/90"
              )}
              aria-label="Buy tokens"
            >
              Buy
            </TabsTrigger>
            <TabsTrigger
              value="sell"
              className={cn(
                "data-[state=active]:bg-red-500 data-[state=active]:text-white",
                "data-[state=active]:hover:bg-red-500/90"
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
          <label className="text-xs text-zinc-400 font-medium">You Pay</label>
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
              className="flex-1 text-base sm:text-lg font-semibold"
              aria-label={`Amount to ${activeTab === "buy" ? "spend" : "sell"}`}
              aria-describedby={balanceError ? "balance-error" : undefined}
            />
            <Select
              value={fromToken}
              disabled
            >
              <SelectTrigger className="w-full sm:w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="IP">IP</SelectItem>
                <SelectItem value="TOKEN">{tokenSymbol}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {/* Balance Display - Stack below on mobile */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1 sm:gap-2 pt-1">
            <span className="text-xs text-zinc-500">
              Balance: {fromToken === "IP" 
                ? (userBalance ? parseFloat(userBalance).toFixed(4) : "0.0000")
                : (tokenBalance ? parseFloat(tokenBalance).toFixed(4) : "0.0000")
              } {fromToken === "IP" ? "IP" : tokenSymbol}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                const balance = fromToken === "IP" ? userBalance : tokenBalance
                if (balance && parseFloat(balance) > 0) {
                  setFromAmount(parseFloat(balance).toString())
                }
              }}
              disabled={!isConnected || (fromToken === "IP" ? !userBalance : !tokenBalance)}
              className="h-6 px-2 text-xs text-sovry-green hover:text-sovry-green/80 hover:bg-sovry-green/10"
              aria-label={`Set maximum ${fromToken} balance`}
            >
              MAX
            </Button>
          </div>
        </div>

        {/* Swap Arrow Button */}
        <div className="flex justify-center -my-2 relative z-10">
          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10 rounded-full border-2 border-zinc-800 bg-zinc-900 hover:bg-zinc-800 hover:border-zinc-700 touch-manipulation"
            onClick={handleSwapTokens}
            aria-label="Swap tokens"
            disabled={isTrading}
          >
            <ArrowDownUp className="h-5 w-5 text-zinc-400" />
          </Button>
        </div>

        {/* You Receive Section */}
        <div className="space-y-2">
          <label className="text-xs text-zinc-400 font-medium">You Receive</label>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Input
                type="text"
                value={toAmount || (isCalculating ? "..." : "")}
                readOnly
                placeholder={detailsLoading ? "Loading..." : "0.0"}
              disabled={detailsLoading || isTrading}
              className="flex-1 text-base sm:text-lg font-semibold pr-10 bg-zinc-800/50"
              aria-label={`Amount to ${activeTab === "buy" ? "receive" : "receive"}`}
              aria-live="polite"
              aria-atomic="true"
            />
              {isCalculating && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
                </div>
              )}
            </div>
            <Select
              value={toToken}
              disabled
            >
              <SelectTrigger className="w-full sm:w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="IP">IP</SelectItem>
                <SelectItem value="TOKEN">{tokenSymbol}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {/* Balance Display - Stack below on mobile */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-zinc-500">
              Balance: {toToken === "IP" 
                ? (userBalance ? parseFloat(userBalance).toFixed(4) : "0.0000")
                : (tokenBalance ? parseFloat(tokenBalance).toFixed(4) : "0.0000")
              } {toToken === "IP" ? "IP" : tokenSymbol}
            </span>
          </div>
        </div>

        {/* Exchange Rate and Price Impact */}
        {(exchangeRate || priceImpact !== null) && (
          <div className="pt-2 border-t border-zinc-800 space-y-2">
            {exchangeRate && (
              <p className="text-xs text-zinc-400 text-center">{exchangeRate}</p>
            )}
            {priceImpact !== null && priceImpact > 0 && (
              <div className="flex items-center justify-center gap-2">
                <span className="text-xs text-zinc-400">
                  Price Impact: <span className={cn(priceImpact > 5 ? "text-red-400 font-semibold" : "text-zinc-300")}>{priceImpact.toFixed(2)}%</span>
                </span>
                {priceImpact > 5 && (
                  <AlertTriangle className="h-3 w-3 text-red-400" aria-hidden="true" />
                )}
              </div>
            )}
            {priceImpact !== null && priceImpact > 5 && (
              <Alert variant="destructive" className="py-2" role="alert">
                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                <AlertDescription className="text-xs">
                  High price impact! This trade will significantly affect the token price.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* Error Messages */}
        {balanceError && (
          <Alert variant="destructive" className="py-2">
            <AlertTriangle className="h-3 w-3" />
            <AlertDescription className="text-xs">
              {balanceError}
            </AlertDescription>
          </Alert>
        )}

        {slippageError && (
          <Alert variant="destructive" className="py-2">
            <AlertTriangle className="h-3 w-3" />
            <AlertDescription className="text-xs">
              {slippageError}
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 ml-1 text-xs underline"
                onClick={() => setShowSlippageSettings(true)}
              >
                Increase slippage
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Simulation feedback */}
        {simulationStatus && (
          <Alert className="mt-2 border-sovry-green/40 bg-sovry-green/10">
            <CheckCircle className="h-3 w-3 text-sovry-green" />
            <AlertDescription className="text-xs text-zinc-200">
              {simulationStatus}
            </AlertDescription>
          </Alert>
        )}
        {simulationError && (
          <Alert variant="destructive" className="mt-2 py-2">
            <AlertTriangle className="h-3 w-3" />
            <AlertDescription className="text-xs">
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
              "w-full h-12 sm:h-12 font-semibold touch-manipulation min-h-[44px]",
              activeTab === "buy"
                ? "bg-green-500 hover:bg-green-500/90 text-white disabled:opacity-50"
                : "bg-red-500 hover:bg-red-500/90 text-white disabled:opacity-50"
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
