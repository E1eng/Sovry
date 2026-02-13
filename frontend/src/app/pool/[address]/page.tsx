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
import { GraduationModal } from "@/components/token/GraduationModal"
import { ProgressToGraduation } from "@/components/token/ProgressBar"
import { SwapInterface } from "@/components/swap/SwapInterface"
import { TokenRevenueStats } from "@/components/token/TokenRevenueStats"
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
  const copyToClipboard = useCallback((text: string, label: string) => {
    if (!text) return
    navigator.clipboard?.writeText(text)
    toast.success(`${label} copied`)
  }, [])
  

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
              <p className="text-sm text-muted-foreground">
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
                  <p className="text-sm text-muted-foreground">
                    The token address you are looking for does not exist or could not be loaded.
                  </p>
                  <p className="text-xs text-muted-foreground/60 mt-2">
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
                  <p className="text-sm text-muted-foreground">
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
                  <p className="text-sm text-muted-foreground">
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
                  <p className="text-sm text-muted-foreground">
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

  const socials = [
    {
      label: "Website",
      url: details.website || (details.launchInfo as any)?.websiteUrl || (details.wrapperMeta as any)?.website,
    },
    {
      label: "Twitter",
      url: details.twitter || (details.launchInfo as any)?.twitterUrl || (details.wrapperMeta as any)?.twitter,
    },
    {
      label: "Telegram",
      url: details.telegram || (details.launchInfo as any)?.telegramUrl || (details.wrapperMeta as any)?.telegram,
    },
  ].filter((s) => !!s.url)

  return (
    <ErrorBoundary>
      <div className="min-h-screen px-3 sm:px-4 md:px-6 lg:px-8 pt-2 sm:pt-5 lg:pt-6 pb-8">
        <div className="w-full space-y-5 sm:space-y-6">
          {/* Breadcrumbs */}
          <Breadcrumb items={breadcrumbItems} />

          {/* Token Header Summary */}
          <div className="border border-border bg-card rounded-lg overflow-hidden">
            <div className="px-3 sm:px-5 py-3 sm:py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="relative h-10 w-10 sm:h-12 sm:w-12 rounded-sm overflow-hidden border border-border bg-muted/40 flex-shrink-0">
                  {details.imageUrl ? (
                    <Image
                      src={details.imageUrl}
                      alt={tokenName}
                      fill
                      unoptimized
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <span className="text-base sm:text-lg font-semibold text-muted-foreground">
                        {tokenName.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                    <h1 className="text-base sm:text-lg font-semibold text-foreground truncate max-w-[180px] sm:max-w-none">{tokenName}</h1>
                    <span className="text-[10px] sm:text-[11px] font-mono uppercase tracking-[0.2em] text-muted-foreground">{ticker}</span>
                    {isTokenGraduated && (
                      <span className="inline-flex items-center gap-1 rounded-sm bg-primary/10 border border-primary/30 px-1.5 sm:px-2 py-0.5 text-[9px] sm:text-[10px] font-mono uppercase tracking-[0.15em] text-primary">
                        Graduated
                      </span>
                    )}
                  </div>
                  {creatorAddress && (
                    <button
                      type="button"
                      onClick={() => copyToClipboard(creatorAddress, "Creator")}
                      className="text-[10px] sm:text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors"
                    >
                      by {truncateAddress(creatorAddress)}
                    </button>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-3">
                {details.marketCap && details.marketCap !== "0" && (
                  <div className="border border-border rounded-sm px-2 sm:px-3 py-1 sm:py-1.5 text-center">
                    <div className="text-[8px] sm:text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground">MCap</div>
                    <div className="text-xs sm:text-sm font-semibold font-mono tabular-nums text-foreground">{details.marketCap} IP</div>
                  </div>
                )}
                {details.currentPrice && (
                  <div className="border border-border rounded-sm px-2 sm:px-3 py-1 sm:py-1.5 text-center">
                    <div className="text-[8px] sm:text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Price</div>
                    <div className="text-xs sm:text-sm font-semibold font-mono tabular-nums text-foreground">{details.currentPrice} IP</div>
                  </div>
                )}
                {dailyChangePct !== null && isFinite(dailyChangePct) && (
                  <div className="border border-border rounded-sm px-2 sm:px-3 py-1 sm:py-1.5 text-center">
                    <div className="text-[8px] sm:text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground">24h</div>
                    <div className={`text-xs sm:text-sm font-semibold font-mono tabular-nums ${
                      dailyChangePct > 0 ? "text-primary" : dailyChangePct < 0 ? "text-red-400" : "text-muted-foreground"
                    }`}>
                      {dailyChangePct > 0 ? "+" : ""}{dailyChangePct.toFixed(2)}%
                    </div>
                  </div>
                )}
                {socials.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    {socials.map((s) => (
                      <a
                        key={s.label}
                        href={s.url as string}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-1.5 text-[10px] font-mono uppercase tracking-[0.15em] text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                      >
                        {s.label}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/*
            Layout: flat grid with per-card ordering.
            Mobile (single column):  Swap → Chart → Progress → Media → Revenue → Holders → Txns → Comments
            Desktop (lg: 12-col):    Left 8-col (Chart, Media, Comments)  |  Right 4-col sticky (Swap, Revenue, Holders, Txns, Progress)
          */}
          <div className="flex flex-col lg:grid lg:grid-cols-12 gap-4 lg:gap-5">

            {/* ── 1. SWAP — first on mobile, right column on desktop ── */}
            <div className="order-1 lg:col-start-9 lg:col-span-4 lg:row-start-1" style={{ animation: "fadeIn 0.5s ease-out 100ms both" }}>
              <Card>
                <CardContent className="p-0">
                  <SwapInterface
                    tokenAddress={address}
                    tokenSymbol={ticker}
                    isGraduated={launchInfo?.graduated || false}
                    piperXPoolAddress={graduationData?.liquidityPoolAddress}
                  />
                </CardContent>
              </Card>
            </div>

            {/* ── 2. CHART — second on mobile, left column on desktop ── */}
            <div className="order-2 lg:col-start-1 lg:col-span-8 lg:row-start-1 lg:row-span-2" style={{ animation: "fadeIn 0.5s ease-out 120ms both" }}>
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
                  <div className="hidden sm:block">
                    <TradingChart
                      tokenAddress={address}
                      height={420}
                      currentPrice={details.currentPrice || null}
                      marketCap={marketCapForChart}
                      reserveBalance={reserveForChart}
                      onDailyChangePct={setDailyChangePct}
                    />
                  </div>
                  <div className="sm:hidden">
                    <TradingChart
                      tokenAddress={address}
                      height={280}
                      currentPrice={details.currentPrice || null}
                      marketCap={marketCapForChart}
                      reserveBalance={reserveForChart}
                      onDailyChangePct={setDailyChangePct}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* ── 3. PROGRESS TO GRADUATION — third on mobile, right column on desktop ── */}
            {launchInfo && launchInfo.totalRaised && (
              <div className="order-3 lg:col-start-9 lg:col-span-4" style={{ animation: "fadeIn 0.5s ease-out 140ms both" }}>
                <Card>
                  <CardContent className="p-3 sm:p-5">
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

            {/* ── 4. IP MEDIA — fourth on mobile, left column on desktop ── */}
            <div className="order-4 lg:col-start-1 lg:col-span-8" style={{ animation: "fadeIn 0.5s ease-out 160ms both" }}>
              <Card className="overflow-hidden">
                <div className="flex items-center justify-between border-b border-border bg-muted px-3 py-2">
                  <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">IP Media</span>
                  <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                    {mediaTypeLabel}
                  </span>
                </div>
                <div className="relative aspect-video max-h-[320px] w-full overflow-hidden bg-muted">
                  {details.imageUrl ? (
                    <Image
                      src={details.imageUrl}
                      alt={tokenName}
                      fill
                      className="object-contain"
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
                      {details.ipId ? (
                        <button
                          type="button"
                          onClick={() => copyToClipboard(details.ipId as string, "IPID")}
                          className="font-mono text-foreground hover:underline decoration-dotted"
                        >
                          {truncateAddress(details.ipId)}
                        </button>
                      ) : (
                        <div className="font-mono text-muted-foreground">—</div>
                      )}
                    </div>
                    <div className="space-y-1">
                      <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Creator</div>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(creatorAddress || "", "Creator")}
                        className="font-mono text-foreground hover:underline decoration-dotted"
                      >
                        {truncateAddress(creatorAddress)}
                      </button>
                    </div>
                    <div className="space-y-1">
                      <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Token</div>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(details.tokenAddress, "Token address")}
                        className="font-mono text-foreground hover:underline decoration-dotted"
                      >
                        {truncateAddress(details.tokenAddress)}
                      </button>
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

                  {socials.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Socials</div>
                      <div className="flex flex-wrap gap-2 text-[11px]">
                        {socials.map((s) => (
                          <a
                            key={s.label}
                            href={s.url as string}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-1 hover:bg-muted/60"
                          >
                            {s.label}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* ── 5. REVENUE STATS — right column on desktop ── */}
            <div className="order-5 lg:col-start-9 lg:col-span-4" style={{ animation: "fadeIn 0.5s ease-out 180ms both" }}>
              <Card>
                <CardContent className="p-3 sm:p-5">
                  <TokenRevenueStats tokenAddress={address} />
                </CardContent>
              </Card>
            </div>

            {/* ── 6. HOLDER DISTRIBUTION — right column on desktop ── */}
            <div className="order-6 lg:col-start-9 lg:col-span-4" style={{ animation: "fadeIn 0.5s ease-out 200ms both" }}>
              <Card>
                <CardContent className="p-3 sm:p-5">
                  <HolderDistribution
                    tokenAddress={address}
                    tokenSymbol={ticker}
                    creatorAddress={creatorAddress || undefined}
                  />
                </CardContent>
              </Card>
            </div>

            {/* ── 7. TRANSACTION HISTORY — right column on desktop ── */}
            <div className="order-7 lg:col-start-9 lg:col-span-4" style={{ animation: "fadeIn 0.5s ease-out 220ms both" }}>
              <Card>
                <CardContent className="p-3 sm:p-5">
                  <TransactionHistory tokenAddress={address} tokenSymbol={ticker} limit={20} />
                </CardContent>
              </Card>
            </div>

            {/* ── 8. COMMENTS — last on mobile, left column on desktop ── */}
            <div className="order-8 lg:col-start-1 lg:col-span-8" style={{ animation: "fadeIn 0.5s ease-out 240ms both" }}>
              <Card>
                <CardHeader className="border-b border-border bg-muted/60">
                  <CardTitle className="text-sm font-semibold text-foreground">Comments</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <PoolComments tokenAddress={address} tokenName={tokenName} />
                </CardContent>
              </Card>
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
