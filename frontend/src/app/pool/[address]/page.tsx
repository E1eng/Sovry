"use client"

import { useParams, useRouter } from "next/navigation"
import dynamic from "next/dynamic"
import Image from "next/image"
import { useState, useEffect, useCallback, useRef } from "react"
import toast from "react-hot-toast"
import { isAddress, formatEther } from "viem"
import { AlertCircle, Home, ArrowLeft, RefreshCw, ArrowUpDown, Globe, Twitter, Send, Copy } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"

import { Breadcrumb } from "@/components/ui/breadcrumb"
import { useLaunchDetails } from "@/hooks/useLaunchDetails"
import { useGraduationEvent } from "@/hooks/useGraduationEvent"
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
import { getPiperXPoolUrl } from "@/lib/piperx"

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
  const [_dailyChangePct, setDailyChangePct] = useState<number | null>(null)
  const [showSwapSheet, setShowSwapSheet] = useState(false)
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
          window.open(getPiperXPoolUrl(eventData.liquidityPoolAddress), "_blank", "noopener,noreferrer")
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
  const dailyChangePct =
    typeof _dailyChangePct === "number" && Number.isFinite(_dailyChangePct)
      ? _dailyChangePct
      : null
  const dailyChangeLabel = dailyChangePct !== null
    ? `${dailyChangePct >= 0 ? "+" : ""}${dailyChangePct.toFixed(2)}%`
    : "—"
  const dailyChangeTone = dailyChangePct === null
    ? "text-muted-foreground"
    : dailyChangePct >= 0
      ? "text-primary"
      : "text-secondary"
  const launchTimeLabel = details.wrapperMeta?.launchTime
    ? new Date(details.wrapperMeta.launchTime * 1000).toLocaleDateString("en-US", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—"
  const formatTokenAmount = (amount?: bigint, fractionDigits = 2) => {
    if (amount === undefined || amount === null) return "—"
    try {
      const num = Number(formatEther(amount))
      if (!Number.isFinite(num)) return "—"
      return num.toLocaleString(undefined, { maximumFractionDigits: fractionDigits })
    } catch {
      return "—"
    }
  }
  const formatRawUnits = (raw?: string, decimals = 18, fractionDigits = 0) => {
    if (!raw) return "—"
    try {
      const value = BigInt(raw)
      const base = 10n ** BigInt(decimals)
      const integer = value / base
      const fraction = value % base
      const num = Number(integer) + Number(fraction) / Number(base)
      if (!Number.isFinite(num)) return "—"
      return num.toLocaleString(undefined, { maximumFractionDigits: fractionDigits })
    } catch {
      return "—"
    }
  }
  const tokensSoldLabel = launchInfo
    ? `${formatTokenAmount(launchInfo.tokensSold, 2)} ${ticker}`
    : "—"
  const supplyLockedLabel = details.wrapperMeta
    ? `${formatRawUnits(details.wrapperMeta.totalLocked, 6, 0)} RT`
    : "—"
  const revenueInjectedLabel = details.wrapperMeta
    ? `${formatRawUnits(details.wrapperMeta.totalRoyaltiesHarvested, 18, 2)} WIP`
    : "—"

  // Breadcrumb items
  const breadcrumbItems = [
    { label: "Home", href: "/" },
    { label: "Launches", href: "/" },
    { label: ticker },
  ]

  const socials = [
    {
      label: "Website",
      icon: Globe,
      url: details.website || (details.launchInfo as any)?.websiteUrl || (details.wrapperMeta as any)?.website,
    },
    {
      label: "Twitter",
      icon: Twitter,
      url: details.twitter || (details.launchInfo as any)?.twitterUrl || (details.wrapperMeta as any)?.twitter,
    },
    {
      label: "Telegram",
      icon: Send,
      url: details.telegram || (details.launchInfo as any)?.telegramUrl || (details.wrapperMeta as any)?.telegram,
    },
  ].filter((s) => !!s.url)

  const headerCard = (
    <div className="border border-border bg-card rounded-sm overflow-hidden">
      <div className="relative px-4 py-4 sm:px-5">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(520px_circle_at_top_right,_rgba(255,255,255,0.08),_transparent_70%)]" />
        <div className="relative flex flex-wrap items-center gap-4">
          {/* Avatar */}
          <div className="relative h-12 w-12 sm:h-14 sm:w-14 rounded-sm overflow-hidden border border-border bg-muted/40 flex-shrink-0">
            {details.imageUrl ? (
              <Image src={details.imageUrl} alt={tokenName} fill unoptimized className="object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <span className="text-base font-semibold text-muted-foreground">{tokenName.charAt(0).toUpperCase()}</span>
              </div>
            )}
          </div>
          {/* Name + creator */}
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-base sm:text-lg font-semibold text-foreground truncate">{tokenName}</h1>
              <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground flex-shrink-0">{ticker}</span>
              {isTokenGraduated && (
                <span className="inline-flex items-center rounded-sm bg-primary/10 border border-primary/30 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-primary flex-shrink-0">
                  Graduated
                </span>
              )}
            </div>
            {creatorAddress && (
              <button
                type="button"
                onClick={() => copyToClipboard(creatorAddress, "Creator")}
                className="text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
              >
                Created by {truncateAddress(creatorAddress)} <Copy className="h-2.5 w-2.5" />
              </button>
            )}
          </div>
          {/* Socials */}
          {socials.length > 0 && (
            <div className="flex items-center gap-1 flex-shrink-0">
              {socials.map((s) => {
                const Icon = s.icon
                return (
                  <a key={s.label} href={s.url as string} target="_blank" rel="noopener noreferrer" title={s.label}
                    className="h-7 w-7 flex items-center justify-center rounded-sm border border-border text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors">
                    <Icon className="h-3.5 w-3.5" />
                  </a>
                )
              })}
            </div>
          )}
        </div>
      </div>
      {/* Meta bar */}
      <div className="border-t border-border bg-muted/30 px-4 py-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Status</span>
            <span className="text-xs font-mono tabular-nums text-foreground">
              {isTokenGraduated ? "Graduated" : "Active"}
            </span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Tokens Sold</span>
            <span className="text-xs font-mono tabular-nums text-foreground">{tokensSoldLabel}</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Supply Locked</span>
            <span className="text-xs font-mono tabular-nums text-foreground">{supplyLockedLabel}</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Launched</span>
            <span className="text-xs font-mono tabular-nums text-foreground">{launchTimeLabel}</span>
          </div>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">24h Change</span>
          <span className={`text-xs font-mono tabular-nums ${dailyChangeTone}`}>{dailyChangeLabel}</span>
        </div>
      </div>
    </div>
  )

  return (
    <ErrorBoundary>
      <div className="min-h-screen px-3 sm:px-4 md:px-6 lg:px-8 pt-2 sm:pt-4 lg:pt-6 pb-8">
        <div className="w-full space-y-4">
          {/* Breadcrumbs */}
          <Breadcrumb items={breadcrumbItems} />

          {/* ── Token Header (mobile) ── */}
          <div className="lg:hidden">
            {headerCard}
          </div>

          {/* ── Two-column grid ── */}
          <div className="grid gap-3 lg:gap-4 lg:grid-cols-12 lg:items-start max-w-full">

            {/* Left column */}
            <div className="order-last lg:order-none lg:col-span-8 lg:col-start-1 space-y-3 min-w-0">

              {/* Token Header (desktop) */}
              <div className="hidden lg:block">
                {headerCard}
              </div>

              {/* Chart */}
              <Card>
                <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-2.5">
                  <span className="text-xs font-semibold text-foreground">{ticker}/IP</span>
                  <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Price Chart</span>
                </div>
                <CardContent className="p-0 overflow-hidden">
                  <div className="hidden sm:block"><TradingChart tokenAddress={address} height={420} currentPrice={details.currentPrice || null} marketCap={marketCapForChart} reserveBalance={reserveForChart} onDailyChangePct={setDailyChangePct} /></div>
                  <div className="sm:hidden"><TradingChart tokenAddress={address} height={280} currentPrice={details.currentPrice || null} marketCap={marketCapForChart} reserveBalance={reserveForChart} onDailyChangePct={setDailyChangePct} /></div>
                </CardContent>
              </Card>

              {/* Holders */}
              <Card>
                <div className="border-b border-border bg-muted/40 px-4 py-2.5">
                  <span className="text-xs font-semibold text-foreground">Holders</span>
                </div>
                <CardContent className="p-4">
                  <HolderDistribution
                    tokenAddress={address}
                    tokenSymbol={ticker}
                    creatorAddress={creatorAddress || undefined}
                  />
                </CardContent>
              </Card>

              {/* Recent Activity (component renders its own Card) */}
              <TransactionHistory tokenAddress={address} tokenSymbol={ticker} limit={20} />

              {/* Comments (component renders its own Card) */}
              <PoolComments tokenAddress={address} tokenName={tokenName} />
            </div>

            {/* Right column — shows FIRST on mobile (progress/holders), sticky on desktop */}
            <div className="order-first lg:order-none lg:col-span-4 lg:col-start-9 space-y-3 min-w-0 lg:sticky lg:top-20 lg:self-start lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto no-scrollbar">

              {/* Swap (desktop only) */}
              <div className="hidden lg:block">
                <SwapInterface
                  tokenAddress={address}
                  tokenSymbol={ticker}
                  mode="trade"
                  isGraduated={launchInfo?.graduated || false}
                  piperXPoolAddress={graduationData?.liquidityPoolAddress}
                />
              </div>

              {/* Progress */}
              {launchInfo && launchInfo.totalRaised && (
                <Card>
                  <CardContent className="p-4">
                    <ProgressToGraduation
                      totalRaised={launchInfo.totalRaised}
                      targetRaise={details.graduationThreshold}
                      isGraduated={launchInfo.graduated}
                    />
                  </CardContent>
                </Card>
              )}

              {/* IP Media */}
              <Card className="overflow-hidden">
                <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-2.5">
                  <span className="text-xs font-semibold text-foreground">IP Media</span>
                  <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">{mediaTypeLabel}</span>
                </div>
                <div className="relative aspect-video max-h-[320px] w-full overflow-hidden bg-muted">
                  {details.imageUrl ? (
                    <Image src={details.imageUrl} alt={tokenName} fill className="object-contain" unoptimized />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-xl font-semibold text-muted-foreground">{tokenName.charAt(0).toUpperCase()}</span>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 border-t border-border px-4 py-3">
                  <div>
                    <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">IPID</div>
                    {details.ipId ? (
                      <button type="button" onClick={() => copyToClipboard(details.ipId as string, "IPID")} className="text-xs font-mono text-foreground hover:underline decoration-dotted">
                        {truncateAddress(details.ipId)}
                      </button>
                    ) : (
                      <span className="text-xs font-mono text-muted-foreground">—</span>
                    )}
                  </div>
                  <div>
                    <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Token</div>
                    <button type="button" onClick={() => copyToClipboard(details.tokenAddress, "Token address")} className="text-xs font-mono text-foreground hover:underline decoration-dotted">
                      {truncateAddress(details.tokenAddress)}
                    </button>
                  </div>
                  <div>
                    <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Metadata</div>
                    {metadataUri ? (
                      <a href={metadataHref || "#"} target="_blank" rel="noopener noreferrer" className="text-xs font-mono text-foreground hover:underline decoration-dotted">View</a>
                    ) : (
                      <span className="text-xs font-mono text-muted-foreground">—</span>
                    )}
                  </div>
                  <div>
                    <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Revenue Injected</div>
                    <span className="text-xs font-mono text-foreground tabular-nums">{revenueInjectedLabel}</span>
                  </div>
                </div>
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
              poolAddress={graduationData?.liquidityPoolAddress}
              tokenAddress={address}
            />
          )}

          {/* Mobile: Sticky Trade button */}
          <div className="sticky bottom-0 z-40 lg:hidden -mx-3 sm:-mx-4 md:-mx-6 px-3 sm:px-4 md:px-6 pb-3 pt-2 bg-gradient-to-t from-background via-background to-transparent">
            <button
              type="button"
              onClick={() => setShowSwapSheet(true)}
              className="w-full flex items-center justify-center gap-2 rounded-sm bg-primary px-6 py-3 text-xs font-mono uppercase tracking-[0.2em] text-primary-foreground shadow-lg hover:brightness-110 active:scale-[0.98] transition-all"
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
              Trade {ticker}
            </button>
          </div>

        </div>
      </div>

      {/* Mobile: Bottom sheet */}
      {showSwapSheet && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowSwapSheet(false)} />
          <div className="absolute bottom-0 left-0 right-0 bg-card border-t border-border rounded-t-2xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <span className="text-xs font-mono uppercase tracking-[0.2em] text-foreground">Trade {ticker}</span>
              <button type="button" onClick={() => setShowSwapSheet(false)} className="h-7 w-7 flex items-center justify-center rounded-sm text-muted-foreground hover:text-foreground transition-colors" aria-label="Close">
                ✕
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto">
              <SwapInterface
                tokenAddress={address}
                tokenSymbol={ticker}
                mode="trade"
                isGraduated={launchInfo?.graduated || false}
                piperXPoolAddress={graduationData?.liquidityPoolAddress}
              />
            </div>
          </div>
        </div>
      )}
    </ErrorBoundary>
  )
}
