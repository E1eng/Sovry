"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { useDynamicContext } from "@dynamic-labs/sdk-react-core"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ArrowDownUp, Settings, Loader2, AlertTriangle, CheckCircle, ExternalLink } from "lucide-react"
import { parseEther, formatEther, encodeFunctionData } from "viem"
import { createPublicClient, http } from "viem"
import toast from "react-hot-toast"
import { cn } from "@/lib/utils"
import { useLaunchDetails } from "@/hooks/useLaunchDetails"
import {
  estimateBuyAmountForIp,
  calculateRealPriceImpact,
  calculateBondingCurveSellProceeds,
  WRAP_UNIT,
} from "@/lib/bondingCurve"
import { SlippageSettings } from "@/components/token/SlippageSettings"
import { launchpadService } from "@/services/launchpadService"
import { SOVRY_LAUNCHPAD_ADDRESS } from "@/services/storyProtocolService"
import { erc20Abi } from "viem"
import { parseTransactionError, logError, isSlippageError, isBalanceError } from "@/lib/errorUtils"
import { trackTrade, trackApproval, trackEvent } from "@/lib/analytics"
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
  onSwap,
  isGraduated = false,
  piperXPoolAddress,
}: SwapInterfaceProps) {
  const [activeTab, setActiveTab] = useState<"buy" | "sell">("buy")
  const [fromAmount, setFromAmount] = useState("")
  const [toAmount, setToAmount] = useState("")
  const [fromToken, setFromToken] = useState<"IP" | "TOKEN">(activeTab === "buy" ? "IP" : "TOKEN")
  const [toToken, setToToken] = useState<"IP" | "TOKEN">(activeTab === "buy" ? "TOKEN" : "IP")
  const [showSlippageSettings, setShowSlippageSettings] = useState(false)

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
  const [isApproved, setIsApproved] = useState(false)
  const [isApproving, setIsApproving] = useState(false)
  const [balanceError, setBalanceError] = useState<string | null>(null)
  const [slippageError, setSlippageError] = useState<string | null>(null)
  const [curveParams, setCurveParams] = useState<any | null>(null)

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
  const { details, loading: detailsLoading } = useLaunchDetails(tokenAddress || null)

  const currentSupply = curveParams?.currentSupply ?? 1n

  // Load real bonding curve parameters from the launchpad
  useEffect(() => {
    let cancelled = false
    const loadCurve = async () => {
      if (!tokenAddress) {
        if (!cancelled) setCurveParams(null)
        return
      }
      try {
        const params = await launchpadService.getCurveParams(tokenAddress)
        if (!cancelled) setCurveParams(params)
      } catch (error) {
        console.error("Error loading bonding curve params:", error)
        if (!cancelled) setCurveParams(null)
      }
    }
    loadCurve()
    return () => {
      cancelled = true
    }
  }, [tokenAddress])

  // Debounce timer ref
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Calculate output amount with debouncing
  const calculateOutput = useCallback(
    async (amount: string, isBuy: boolean) => {
      if (
        !amount ||
        parseFloat(amount) <= 0 ||
        !tokenAddress ||
        !curveParams
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
          const { amount: tokenAmount, totalCost } = estimateBuyAmountForIp(curveParams, amountBigInt)
          if (tokenAmount === 0n || totalCost === 0n) {
            setToAmount("")
            setPriceImpact(null)
            setExchangeRate("")
            return
          }
          const tokenWei = tokenAmount * (10n ** 12n)
          const outputFormatted = formatEther(tokenWei)
          const slippagePercent = parseFloat(slippage) || 0.5
          const minOut = parseFloat(outputFormatted) * (1 - slippagePercent / 100)
          setToAmount(minOut.toFixed(6))
          impact = calculateRealPriceImpact(curveParams, tokenAmount, true)
          const rate = parseFloat(outputFormatted) / parseFloat(amount)
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

          const baseProceeds = calculateBondingCurveSellProceeds(curveParams, wrapperAmount)
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

          impact = calculateRealPriceImpact(curveParams, wrapperAmount, false)
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
    [tokenAddress, currentSupply, slippage, fromToken, toToken, curveParams]
  )

  // Debounced calculation effect
  useEffect(() => {
    // Clear previous timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    // Set new timer
    debounceTimerRef.current = setTimeout(() => {
      if (fromAmount) {
        calculateOutput(fromAmount, activeTab === "buy")
      } else {
        setToAmount("")
        setPriceImpact(null)
        setExchangeRate("")
      }
    }, 300) // 300ms debounce

    // Cleanup
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [fromAmount, activeTab, calculateOutput, tokenAddress, currentSupply])

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

  // Fetch user's token balance and check approval
  useEffect(() => {
    const fetchTokenBalanceAndApproval = async () => {
      if (!primaryWallet?.address || !tokenAddress) {
        setTokenBalance(null)
        setIsApproved(false)
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

        // Check approval. Allowance is also in 6-decimal units, so normalise
        // to 18-decimal before comparing with the 18-decimal sell amount.
        const allowanceRaw = await publicClient.readContract({
          address: tokenAddress as `0x${string}`,
          abi: erc20Abi,
          functionName: "allowance",
          args: [primaryWallet.address as `0x${string}`, SOVRY_LAUNCHPAD_ADDRESS as `0x${string}`],
        }) as bigint

        const allowanceWei = allowanceRaw * (10n ** 12n)
        const sellAmountWei = fromAmount && fromToken === "TOKEN" ? parseEther(fromAmount) : 0n
        setIsApproved(allowanceWei >= sellAmountWei && sellAmountWei > 0n)
      } catch (error) {
        console.error("Error fetching token balance/approval:", error)
        setTokenBalance(null)
        setIsApproved(false)
      }
    }

    fetchTokenBalanceAndApproval()
  }, [primaryWallet?.address, tokenAddress, fromAmount, fromToken, publicClient])

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
        toast.error("Insufficient IP balance", {
          description: `You have ${userBalance || "0"} IP`,
          duration: 4000,
        })
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
      if (!curveParams) {
        toast.error("Bonding curve data not loaded yet. Please wait and try again.", {
          duration: 3000,
        })
        return
      }
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
            setEstimatedGasCost(null)
          }, 2000)
        } else {
          trackTrade("buy", tokenAddress, fromAmount, false, result.error)
          const parsedError = parseTransactionError(result.error || new Error("Unknown error"))
          logError(result.error || new Error("Unknown error"), "SwapInterface.buy")

          if (isSlippageError(result.error)) {
            setSlippageError(parsedError.userFriendlyMessage)
            toast.error(parsedError.userFriendlyMessage, {
              description: parsedError.suggestion,
              duration: 5000,
            })
          } else {
            toast.error(parsedError.userFriendlyMessage, {
              description: parsedError.suggestion || parsedError.message,
              duration: 5000,
            })
          }
        }
      } catch (error) {
        const parsedError = parseTransactionError(error)
        logError(error, "SwapInterface.buy")
        trackTrade("buy", tokenAddress, fromAmount, false, parsedError.message)

        if (isSlippageError(error)) {
          setSlippageError(parsedError.userFriendlyMessage)
          toast.error(parsedError.userFriendlyMessage, {
            description: parsedError.suggestion,
            duration: 5000,
          })
        } else {
          toast.error(parsedError.userFriendlyMessage, {
            description: parsedError.suggestion || parsedError.message,
            duration: 5000,
          })
        }
      } finally {
        setIsTrading(false)
      }
    } else if (activeTab === "sell" && fromToken === "TOKEN") {
      // Validate token balance
      if (!tokenBalance || parseFloat(tokenBalance) < parseFloat(fromAmount)) {
        const errorMsg = `Insufficient token balance. You have ${tokenBalance || "0"} ${tokenSymbol}, but need ${fromAmount} ${tokenSymbol}.`
        setBalanceError(errorMsg)
        toast.error("Insufficient token balance", {
          description: `You have ${tokenBalance || "0"} ${tokenSymbol}`,
          duration: 4000,
        })
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
      // Calculate minIpOut with slippage
      const ipAmountBigInt = parseEther(fromAmount)
      const actualIpOut = calculateSellAmount(ipAmountBigInt, currentSupply)
      const actualIpOutFormatted = parseFloat(formatEther(actualIpOut))
      const minIpOut = actualIpOutFormatted * (1 - slippagePercent / 100)

      // Create a sell function that only does the sell (not approval)
      const walletClient = await primaryWallet.getWalletClient()
      if (!walletClient) {
        throw new Error("No wallet client available")
      }

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
          setIsApproved(false) // Reset approval status
          setEstimatedGasCost(null)
        }, 2000)
      } else {
        trackTrade("sell", tokenAddress, fromAmount, false, result.error)
        const parsedError = parseTransactionError(result.error || new Error("Unknown error"))
        logError(result.error || new Error("Unknown error"), "SwapInterface.sell")

        if (isSlippageError(result.error)) {
          setSlippageError(parsedError.userFriendlyMessage)
          toast.error(parsedError.userFriendlyMessage, {
            description: parsedError.suggestion,
            duration: 5000,
          })
        } else {
          toast.error(parsedError.userFriendlyMessage, {
            description: parsedError.suggestion || parsedError.message,
            duration: 5000,
          })
        }
      }
    } catch (error) {
      const parsedError = parseTransactionError(error)
      logError(error, "SwapInterface.sell")
      trackTrade("sell", tokenAddress, fromAmount, false, parsedError.message)
      
      if (isSlippageError(error)) {
        setSlippageError(parsedError.userFriendlyMessage)
        toast.error(parsedError.userFriendlyMessage, {
          description: parsedError.suggestion,
          duration: 5000,
        })
      } else {
        toast.error(parsedError.userFriendlyMessage, {
          description: parsedError.suggestion || parsedError.message,
          duration: 5000,
        })
      }
    } finally {
      setIsTrading(false)
      setApprovalStep(null)
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
              disabled={detailsLoading || !tokenAddress || isTrading || isApproving}
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
            disabled={isTrading || isApproving}
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
              disabled={detailsLoading || isTrading || isApproving}
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

        {/* Place Trade Button */}
        <Button
          onClick={handlePlaceTrade}
          disabled={
            !fromAmount ||
            parseFloat(fromAmount) <= 0 ||
            !isConnected ||
            isTrading ||
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
          {isTrading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Confirming...
            </>
          ) : tradeSuccess ? (
            <>
              <CheckCircle className="h-4 w-4 mr-2" />
              Trade Successful!
            </>
          ) : !isConnected ? (
            "Connect Wallet"
          ) : (
            "Place Trade"
          )}
        </Button>
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

