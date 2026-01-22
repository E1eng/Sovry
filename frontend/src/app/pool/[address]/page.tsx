"use client"

import { useParams, useRouter } from "next/navigation"
import dynamic from "next/dynamic"
import Image from "next/image"
import { useState, useEffect, useCallback, useRef } from "react"
import toast from "react-hot-toast"
import { isAddress } from "viem"
import { AlertCircle, Home, ArrowLeft, RefreshCw } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Breadcrumb } from "@/components/ui/breadcrumb"
import { useLaunchDetails } from "@/hooks/useLaunchDetails"
import { useGraduationEvent } from "@/hooks/useGraduationEvent"
import { TokenHeader } from "@/components/token/TokenHeader"
import { GraduationModal } from "@/components/token/GraduationModal"
import { ProgressToGraduation } from "@/components/token/ProgressBar"
import { SwapInterface } from "@/components/swap/SwapInterface"
import { TokenDetailSkeleton } from "@/components/token/TokenDetailSkeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { logError, isNetworkError, isRPCError } from "@/lib/errorUtils"
import { ErrorBoundary } from "@/components/ErrorBoundary"
import { IPFS_GATEWAY } from "@/lib/env"
import { truncateAddress } from "@/lib/utils"

const TradingChart = dynamic(
  () => import("@/components/trading/TradingChart").then((m) => m.TradingChart),
  { ssr: false },
)

const TransactionHistory = dynamic(
  () => import("@/components/token/TransactionHistory").then((m) => m.TransactionHistory),
  { ssr: false },
)

const PoolComments = dynamic(
  () => import("@/components/social/PoolComments").then((m) => m.PoolComments),
  { ssr: false },
)

const HolderDistribution = dynamic(
  () => import("@/components/trading/holderDistribution"),
  { ssr: false },
)

export default function TokenDetailPage() {
  const params = useParams()
  const router = useRouter()
  const address = params.address as string
  const { details, loading, error, retry: refreshDetails } = useLaunchDetails(address)
  
  const [showGraduationModal, setShowGraduationModal] = useState(false)
  const [graduationData, setGraduationData] = useState<{
    finalRaise: bigint
    liquidityPoolAddress: string
  } | null>(null)
  const redirectTimerRef = useRef<NodeJS.Timeout | null>(null)
  const [dailyChangePct, setDailyChangePct] = useState<number | null>(null)
  

  // Validate address format
  const isValidAddress = address && isAddress(address)

  // Handle graduation event
  const handleGraduation = useCallback(
    (eventData: { tokenAddress: string; finalRaise: bigint; liquidityPoolAddress: string }) => {
      // Only process if it's for the current token
      if (eventData.tokenAddress.toLowerCase() !== address.toLowerCase()) {
        return
      }

      setGraduationData({
        finalRaise: eventData.finalRaise,
        liquidityPoolAddress: eventData.liquidityPoolAddress,
      })
      setShowGraduationModal(true)

      // Show toast notification
      const ticker = details?.symbol || "Token"
      toast.success(`🎓 ${ticker} has graduated to PiperX!`, {
        duration: 5000,
        icon: "🎉",
      })

      // Refresh token data to show new graduated state
      refreshDetails()

      // Optional: Redirect to PiperX pool page after 5 seconds
      if (eventData.liquidityPoolAddress) {
        redirectTimerRef.current = setTimeout(() => {
          // Construct PiperX DEX URL (adjust based on your DEX structure)
          const piperXUrl = `https://piperx.io/pool/${eventData.liquidityPoolAddress}`
          window.open(piperXUrl, "_blank", "noopener,noreferrer")
        }, 5000)
      }
    },
    [address, details?.symbol, refreshDetails]
  )

  // Watch for graduation events
  useGraduationEvent({
    tokenAddress: address,
    onGraduation: handleGraduation,
    enabled: !!address && !details?.launchInfo?.graduated, // Only watch if not already graduated
  })

  // Also refresh launch details immediately when the trading UI or
  // TransactionHistory dispatches a global "refresh-trades" event for
  // this token. This keeps the progress bar and header stats in sync
  // right after a buy/sell without waiting for the poll interval.
  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<{ tokenAddress?: string }>
      const target = custom.detail?.tokenAddress

      if (!target || target.toLowerCase() === address.toLowerCase()) {
        refreshDetails()
      }
    }

    if (typeof window !== "undefined") {
      window.addEventListener("refresh-trades", handler)
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("refresh-trades", handler)
      }
    }
  }, [address, refreshDetails])

  // Cleanup redirect timer
  useEffect(() => {
    return () => {
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current)
      }
    }
  }, [])

  // Loading state - only show full skeleton on initial load when we don't
  // have any details yet. Subsequent refreshes keep the existing UI while
  // data is being updated in the background so the page doesn't "flash".
  if (loading && !details) {
    return <TokenDetailSkeleton />
  }

  // Invalid address format - 404
  if (!isValidAddress) {
    logError(new Error(`Invalid address format: ${address}`), "TokenDetailPage")
    return (
      <div className="min-h-screen px-4 md:px-6 py-8 sm:py-12">
        <div className="max-w-7xl mx-auto">
          <Card className="max-w-md mx-auto">
            <CardContent className="p-8 text-center space-y-4">
              <div className="text-6xl mb-4">404</div>
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>Invalid token address</AlertDescription>
              </Alert>
              <p className="text-sm text-zinc-400">
                The address {address} is not a valid Ethereum address.
              </p>
              <div className="flex gap-3 justify-center">
                <Button onClick={() => router.back()} variant="outline">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Go Back
                </Button>
                <Button onClick={() => router.push("/")} variant="outline">
                  <Home className="h-4 w-4 mr-2" />
                  Go Home
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  // Error state or token not found
  if (error || !details) {
    const isNetworkErr = error ? isNetworkError(new Error(error)) : false
    const isRPCErr = error ? isRPCError(new Error(error)) : false
    const isTokenNotFound = !error || error.toLowerCase().includes('not found') || error.toLowerCase().includes('does not exist')
    
    logError(error || new Error("Token not found"), "TokenDetailPage")

    return (
      <div className="min-h-screen px-4 md:px-6 py-8 sm:py-12">
        <div className="max-w-7xl mx-auto">
          <Card className="max-w-md mx-auto">
            <CardContent className="p-8 text-center space-y-4">
              {isTokenNotFound && (
                <>
                  <div className="text-6xl mb-4">404</div>
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>Token not found</AlertDescription>
                  </Alert>
                  <p className="text-sm text-zinc-400">
                    The token address you are looking for does not exist or could not be loaded.
                  </p>
                  <p className="text-xs text-zinc-500 mt-2">
                    If you just created this token, it may take a few moments to appear. Please try again shortly.
                  </p>
                </>
              )}
              
              {isNetworkErr && (
                <>
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>Network error</AlertDescription>
                  </Alert>
                  <p className="text-sm text-zinc-400">
                    Unable to connect to the network. Please check your internet connection.
                  </p>
                </>
              )}

              {isRPCErr && (
                <>
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>Blockchain network error</AlertDescription>
                  </Alert>
                  <p className="text-sm text-zinc-400">
                    The blockchain network may be congested. Try switching networks or try again in a moment.
                  </p>
                </>
              )}

              {!isTokenNotFound && !isNetworkErr && !isRPCErr && error && (
                <>
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                  <p className="text-sm text-zinc-400">
                    An error occurred while loading the token.
                  </p>
                </>
              )}

              <div className="flex gap-3 justify-center flex-wrap">
                <Button onClick={() => refreshDetails()} variant="outline">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Retry
                </Button>
                <Button onClick={() => router.back()} variant="outline">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Go Back
                </Button>
                <Button onClick={() => router.push("/")} variant="outline">
                  <Home className="h-4 w-4 mr-2" />
                  Go Home
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  const launchInfo = details.launchInfo
  const ticker = details.symbol || "TOKEN"
  const tokenName = details.name || ticker
  const creatorAddress = details.wrapperMeta?.creator || details.launchInfo?.creator
  const isTokenGraduated = Boolean(details.wrapperMeta?.graduated ?? launchInfo?.graduated)
  const marketCapForChart = isTokenGraduated && details.marketCap === "0" ? null : (details.marketCap || null)
  const reserveForChart = isTokenGraduated && details.reserveBalance === "0" ? null : (details.reserveBalance || null)
  const metadataUri = details.metadata_uri || details.metadataUri
  const metadataHref = metadataUri && metadataUri.startsWith("ipfs://")
    ? `${IPFS_GATEWAY}/${metadataUri.replace("ipfs://", "")}`
    : metadataUri
  const mediaTypeLabel = details.mediaType || "image"

  // Breadcrumb items
  const breadcrumbItems = [
    { label: "Home", href: "/" },
    { label: "Launches", href: "/" },
    { label: ticker },
  ]

  return (
    <ErrorBoundary>
      <div className="min-h-screen px-3 sm:px-4 md:px-6 lg:px-8 py-5 sm:py-8 lg:py-10">
        <div className="w-full space-y-5 sm:space-y-6">
          {/* Breadcrumbs */}
          <Breadcrumb items={breadcrumbItems} />

          {/* Token Header */}
          <div
            style={{
              animation: "fadeIn 0.5s ease-out 0ms both",
            }}
          >
            <TokenHeader details={details} />
          </div>

          {/* Bento Grid Layout */}
          <div className="grid gap-4 lg:gap-5 lg:grid-cols-12">
            {/* Media Panel */}
            <div
              className="order-1 lg:order-1 lg:col-span-4"
              style={{
                animation: "fadeIn 0.5s ease-out 80ms both",
              }}
            >
              <Card className="overflow-hidden">
                <div className="flex items-center justify-between border-b border-border bg-muted px-3 py-2">
                  <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">IP Media</span>
                  <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                    {mediaTypeLabel}
                  </span>
                </div>
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
                  {details.imageUrl ? (
                    <Image
                      src={details.imageUrl}
                      alt={tokenName}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-xl font-semibold text-muted-foreground">
                        {tokenName.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>
                <CardContent className="p-3 space-y-3">
                  <div className="space-y-1">
                    <div className="text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground">Asset</div>
                    <div className="text-sm font-semibold text-foreground truncate">{tokenName}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="space-y-1">
                      <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Symbol</div>
                      <div className="font-mono text-foreground tabular-nums">{ticker}</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">IPID</div>
                      <div className="font-mono text-foreground">
                        {truncateAddress(details.ipId)}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Creator</div>
                      <div className="font-mono text-foreground">
                        {truncateAddress(creatorAddress)}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Token</div>
                      <div className="font-mono text-foreground">
                        {truncateAddress(details.tokenAddress)}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Metadata URI</div>
                    {metadataUri ? (
                      <a
                        href={metadataHref || "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-[11px] font-mono text-foreground hover:underline decoration-dotted underline-offset-2 truncate"
                      >
                        {metadataUri}
                      </a>
                    ) : (
                      <span className="text-[11px] font-mono text-muted-foreground">—</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Trading Chart */}
            <div
              className="order-3 lg:order-2 lg:col-span-8"
              style={{
                animation: "fadeIn 0.5s ease-out 140ms both",
              }}
            >
              <Card>
                <CardHeader className="border-b border-border bg-muted/60">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                        Price Chart
                      </div>
                      <CardTitle className="text-lg font-semibold text-foreground">
                        {ticker}/IP
                      </CardTitle>
                    </div>
                    {dailyChangePct !== null && isFinite(dailyChangePct) && (
                      <div className="text-sm font-mono tabular-nums">
                        <span
                          className={
                            dailyChangePct > 0
                              ? "text-primary"
                              : dailyChangePct < 0
                              ? "text-secondary"
                              : "text-muted-foreground"
                          }
                        >
                          {dailyChangePct > 0 ? "+" : ""}
                          {dailyChangePct.toFixed(2)}%
                        </span>
                        <span className="ml-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                          24h
                        </span>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <TradingChart
                    tokenAddress={address}
                    height={420}
                    currentPrice={details.currentPrice || null}
                    marketCap={marketCapForChart}
                    reserveBalance={reserveForChart}
                    onDailyChangePct={setDailyChangePct}
                  />
                </CardContent>
              </Card>
            </div>

            {/* Swap Interface */}
            <div
              className="order-2 lg:order-3 lg:col-span-4"
              style={{
                animation: "fadeIn 0.5s ease-out 200ms both",
              }}
            >
              <SwapInterface
                tokenAddress={address}
                tokenSymbol={ticker}
                isGraduated={launchInfo?.graduated || false}
                piperXPoolAddress={graduationData?.liquidityPoolAddress}
              />
            </div>

            {/* Progress to Graduation */}
            {launchInfo && launchInfo.totalRaised && (
              <div
                className="order-4 lg:order-4 lg:col-span-4"
                style={{
                  animation: "fadeIn 0.5s ease-out 260ms both",
                }}
              >
                <Card>
                  <CardContent className="p-4 sm:p-5">
                    <ProgressToGraduation
                      totalRaised={launchInfo.totalRaised}
                      tokenTicker={ticker}
                      tokenName={tokenName}
                      tokenAddress={address}
                      isGraduated={launchInfo.graduated}
                    />
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Top Holders */}
            <div
              className={"order-5 lg:order-5 lg:col-span-4"}
              style={{
                animation: "fadeIn 0.5s ease-out 320ms both",
              }}
            >
              <HolderDistribution
                tokenAddress={address}
                tokenSymbol={ticker}
                creatorAddress={creatorAddress || undefined}
              />
            </div>

            {/* Activity Feed */}
            <div
              className="order-6 lg:order-6 lg:col-span-6"
              style={{
                animation: "fadeIn 0.5s ease-out 380ms both",
              }}
            >
              <TransactionHistory tokenAddress={address} tokenSymbol={ticker} limit={20} />
            </div>

            {/* Comments */}
            <div
              className="order-7 lg:order-7 lg:col-span-6"
              style={{
                animation: "fadeIn 0.5s ease-out 440ms both",
              }}
            >
              <PoolComments tokenAddress={address} tokenName={tokenName} />
            </div>
          </div>

          {/* Graduation Modal */}
          {details && (
            <GraduationModal
              open={showGraduationModal}
              onOpenChange={setShowGraduationModal}
              tokenTicker={details.symbol || "TOKEN"}
              tokenName={details.name || "Token"}
              tokenAddress={graduationData?.liquidityPoolAddress || address}
            />
          )}
        </div>
      </div>
    </ErrorBoundary>
  )
}
