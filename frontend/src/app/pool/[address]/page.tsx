"use client"

import { useParams, useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Breadcrumb } from "@/components/ui/breadcrumb"
import { useLaunchDetails } from "@/hooks/useLaunchDetails"
import { useGraduationEvent } from "@/hooks/useGraduationEvent"
import { TokenHeader } from "@/components/token/TokenHeader"
import { GraduationModal } from "@/components/token/GraduationModal"
import { ProgressToGraduation } from "@/components/token/ProgressBar"
import { SwapInterface } from "@/components/token/SwapInterface"
import { TradingChart } from "@/components/token/TradingChart"
import { TokenDetailSkeleton } from "@/components/token/TokenDetailSkeleton"
import { TransactionHistory } from "@/components/token/TransactionHistory"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { AlertCircle, Home, ArrowLeft, RefreshCw } from "lucide-react"
import { useState, useEffect, useCallback, useRef } from "react"
import toast from "react-hot-toast"
import { isAddress } from "viem"
import { logError, isNetworkError, isRPCError } from "@/lib/errorUtils"
import { ErrorBoundary } from "@/components/ErrorBoundary"

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

  // Check if token is already graduated on mount (handle edge case)
  useEffect(() => {
    if (details?.launchInfo?.graduated && !showGraduationModal) {
      // Token is already graduated - don't show modal automatically
      // but ensure the UI reflects the graduated state
      // The modal can still be triggered manually if needed
      }
  }, [details?.launchInfo?.graduated, showGraduationModal])

  // Cleanup redirect timer
  useEffect(() => {
    return () => {
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current)
      }
    }
  }, [])

  // Loading state
  if (loading) {
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
                The address "{address}" is not a valid Ethereum address.
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
                    The token address you're looking for doesn't exist or couldn't be loaded.
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

  const bondingProgress = details.bondingProgress || 0
  const launchInfo = details.launchInfo
  const ticker = details.symbol || "TOKEN"
  const tokenName = details.name || ticker

  // Breadcrumb items
  const breadcrumbItems = [
    { label: "Home", href: "/" },
    { label: "Launches", href: "/" },
    { label: ticker },
  ]

  return (
    <ErrorBoundary>
      <div className="min-h-screen px-4 md:px-6 py-8 sm:py-12">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Breadcrumbs */}
        <Breadcrumb items={breadcrumbItems} />

        {/* Token Header - Full Width */}
        <div
          style={{
            animation: "fadeIn 0.5s ease-out 0ms both",
          }}
        >
          <TokenHeader details={details} />
        </div>

        {/* Mobile Layout: Stack vertically with custom order */}
        <div className="flex flex-col lg:hidden space-y-6">
          {/* Swap Interface - First on mobile */}
          <div
            style={{
              animation: "fadeIn 0.5s ease-out 100ms both",
            }}
          >
            <SwapInterface
              tokenAddress={address}
              tokenSymbol={ticker}
              isGraduated={launchInfo?.graduated || false}
              piperXPoolAddress={graduationData?.liquidityPoolAddress}
            />
          </div>

          {/* Progress to Graduation - Second on mobile */}
          {launchInfo && launchInfo.totalRaised && (
            <div
              style={{
                animation: "fadeIn 0.5s ease-out 200ms both",
              }}
            >
              <Card>
                <CardContent className="p-4 sm:p-6">
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

          {/* Trading Chart - Third on mobile */}
          <div
            style={{
              animation: "fadeIn 0.5s ease-out 300ms both",
            }}
          >
            <Card>
              <CardHeader>
                <CardTitle>Price Chart</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <TradingChart tokenAddress={address} height={300} />
              </CardContent>
            </Card>
          </div>

          {/* Activity Feed - Last on mobile */}
          <div
            style={{
              animation: "fadeIn 0.5s ease-out 400ms both",
            }}
          >
            <TransactionHistory tokenAddress={address} limit={20} />
          </div>
        </div>

        {/* Desktop Layout: Two-Column Grid */}
        <div className="hidden lg:grid grid-cols-[60%_40%] gap-6">
          {/* Left Column: TradingChart, then ProgressToGraduation */}
          <div className="space-y-6">
            {/* Trading Chart */}
            <div
              style={{
                animation: "fadeIn 0.5s ease-out 100ms both",
              }}
            >
              <Card>
                <CardHeader>
                  <CardTitle>Price Chart</CardTitle>
                </CardHeader>
                <CardContent>
                  <TradingChart tokenAddress={address} height={500} />
                </CardContent>
              </Card>
            </div>

            {/* Progress to Graduation */}
            {launchInfo && launchInfo.totalRaised && (
              <div
                style={{
                  animation: "fadeIn 0.5s ease-out 200ms both",
                }}
              >
                <Card>
                  <CardContent className="p-6">
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
          </div>

          {/* Right Column: SwapInterface, then Activity Feed */}
          <div className="space-y-6">
            {/* Swap Interface */}
            <div
              style={{
                animation: "fadeIn 0.5s ease-out 150ms both",
              }}
            >
              <SwapInterface
                tokenAddress={address}
                tokenSymbol={ticker}
                isGraduated={launchInfo?.graduated || false}
                piperXPoolAddress={graduationData?.liquidityPoolAddress}
              />
            </div>

            {/* Activity Feed */}
            <div
              style={{
                animation: "fadeIn 0.5s ease-out 250ms both",
              }}
            >
              <TransactionHistory tokenAddress={address} limit={20} />
            </div>
          </div>
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
    </ErrorBoundary>
  )
}
