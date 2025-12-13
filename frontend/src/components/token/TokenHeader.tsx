"use client"

import { useState } from "react"
import Image from "next/image"
import { formatEther } from "viem"
import { Copy, Check, Twitter, Globe, MessageCircle, CheckCircle2, ChevronDown } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import toast from "react-hot-toast"
import { cn, copyToClipboard } from "@/lib/utils"
import type { LaunchDetails } from "@/hooks/useLaunchDetails"

export interface TokenHeaderProps {
  details: LaunchDetails
  className?: string
}

interface SocialLinks {
  twitter?: string
  telegram?: string
  website?: string
}

export function TokenHeader({ details, className }: TokenHeaderProps) {
  const [copied, setCopied] = useState(false)
  const [metricsOpen, setMetricsOpen] = useState(false)
  const storyscanBaseUrl =
    process.env.NEXT_PUBLIC_STORYSCAN_BASE_URL || "https://aeneid.storyscan.io"

  // Normalize metadata URI for browser navigation: display raw ipfs://, but
  // click-through uses an HTTP IPFS gateway so it opens correctly.
  const metadataUri = details.metadata_uri || details.metadataUri
  const metadataHref =
    metadataUri && metadataUri.startsWith("ipfs://")
      ? `https://ipfs.io/ipfs/${metadataUri.replace("ipfs://", "")}`
      : metadataUri

  const handleCopyAddress = async () => {
    const success = await copyToClipboard(details.tokenAddress)
    
    if (success) {
      setCopied(true)
      toast.success("Address copied to clipboard!", {
        duration: 2000,
        style: {
          background: "#1a1a1a",
          border: "1px solid #333",
          color: "#fff",
        },
      })
      setTimeout(() => setCopied(false), 2000)
    } else {
      toast.error("Failed to copy address", {
        duration: 3000,
        style: {
          background: "#1a1a1a",
          border: "1px solid #333",
          color: "#fff",
        },
      })
    }
  }

  const socialLinks: SocialLinks = {
    twitter: details.twitter,
    telegram: details.telegram,
    website: details.website,
  }

  const wrapperMeta = details.wrapperMeta
  const isGraduated = (wrapperMeta?.graduated ?? details.launchInfo?.graduated) || false
  const creator = wrapperMeta?.creator || details.launchInfo?.creator
  const totalRaised = details.launchInfo?.totalRaised
  const marketCap = details.marketCap
  const graduationLiquidity = details.graduationInfo?.totalLiquidity
  const imageUrl = details.imageUrl
  const ticker = details.symbol || "TOKEN"
  const name = details.name || ticker

  // Format final raise amount
  const formatFinalRaise = (amount: bigint | undefined) => {
    if (!amount || amount <= 0n) return null
    const formatted = (Number(amount) / 1e18).toFixed(3)
    return `${formatted} IP`
  }

  const formatLiquidity = (amount: bigint | undefined) => {
    if (!amount || amount <= 0n) return null
    const formatted = formatEther(amount)
    const num = Number(formatted)
    if (!Number.isFinite(num) || num <= 0) return null
    return `${num.toLocaleString(undefined, { maximumFractionDigits: 3 })} IP`
  }

  const formatMarketCapString = (value: string | undefined) => {
    if (!value) return null
    const num = Number(value)
    if (!Number.isFinite(num) || num <= 0) return null
    return `${num.toLocaleString(undefined, { maximumFractionDigits: 3 })} IP`
  }

  const truncateAddress = (address: string) => {
    if (!address || address.length < 10) return address
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  const getIpIdExplorerUrl = (ipId: string | undefined | null) => {
    if (!ipId) return undefined
    return `https://aeneid.explorer.story.foundation/ipa/${ipId}`
  }

  const getAddressExplorerUrl = (address: string | undefined | null) => {
    if (!address) return undefined
    return `${storyscanBaseUrl}/address/${address}`
  }

  const formatAmount = (raw: string | undefined, decimals: number, fractionDigits: number = 3) => {
    if (!raw) return "0"
    try {
      const value = BigInt(raw)
      const base = 10n ** BigInt(decimals)
      const integer = value / base
      const fraction = value % base
      const asNumber = Number(integer) + Number(fraction) / Number(base)
      if (!isFinite(asNumber)) return "0"
      return asNumber.toFixed(fractionDigits)
    } catch {
      return "0"
    }
  }

  const formatTimestamp = (seconds: number | undefined) => {
    if (!seconds || seconds <= 0) return "—"
    const d = new Date(seconds * 1000)
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  }

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className="p-4 sm:p-6">
        <div className="flex flex-row flex-wrap items-start sm:items-center gap-4 sm:gap-6">
          {/* Token Image */}
          <div className="relative w-28 h-28 sm:w-32 sm:h-32 flex-shrink-0 rounded-2xl overflow-hidden bg-zinc-800 border border-zinc-800">
            {imageUrl ? (
              <Image
                src={imageUrl}
                alt={name}
                fill
                className="object-cover"
                loading="lazy"
                unoptimized
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-zinc-700/60">
                <span className="text-3xl font-bold text-zinc-400">
                  {ticker.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
          </div>

          {/* Token Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 sm:gap-3 mb-2">
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-zinc-50 truncate">
                  {name}
                </h1>
                <div className="mt-1 inline-flex items-center gap-2">
                  <span className="px-3 py-1 rounded-full bg-zinc-900/70 border border-zinc-700 text-xs sm:text-sm font-mono tracking-wide uppercase text-zinc-100">
                    {ticker}
                  </span>
                </div>
              </div>
              {isGraduated ? (
                <Badge
                  variant="outline"
                  className="border-emerald-500/60 bg-emerald-500/10 text-emerald-300 flex items-center gap-1.5 text-[11px] sm:text-xs whitespace-nowrap"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Graduated
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="border-zinc-600 bg-zinc-800/60 text-zinc-300 flex items-center gap-1.5 text-[11px] sm:text-xs whitespace-nowrap"
                >
                  <span className="inline-flex h-1.5 w-1.5 rounded-full bg-zinc-400" />
                  Active
                </Badge>
              )}
            </div>
            {(isGraduated && formatMarketCapString(marketCap)) && (
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs sm:text-sm text-zinc-500">Market Cap:</span>
                <span className="text-xs sm:text-sm font-semibold text-yellow-400">
                  {formatMarketCapString(marketCap)}
                </span>
              </div>
            )}

            {(isGraduated && !formatMarketCapString(marketCap) && formatLiquidity(graduationLiquidity)) && (
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs sm:text-sm text-zinc-500">Liquidity:</span>
                <span className="text-xs sm:text-sm font-semibold text-yellow-400">
                  {formatLiquidity(graduationLiquidity)}
                </span>
              </div>
            )}

            {/* Creator Address */}
            {creator && (
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs sm:text-sm text-zinc-500">Created by</span>
                <a
                  href={getAddressExplorerUrl(creator)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs sm:text-sm font-medium text-zinc-300 hover:text-zinc-100 hover:underline decoration-dotted underline-offset-2"
                >
                  {truncateAddress(creator)}
                </a>
              </div>
            )}

            {/* Contract Address with Copy */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800/50 rounded-lg border border-zinc-800 group">
                <a
                  href={getAddressExplorerUrl(details.tokenAddress)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs sm:text-sm text-zinc-400 font-mono hover:text-zinc-100 hover:underline decoration-dotted underline-offset-2"
                >
                  {truncateAddress(details.tokenAddress)}
                </a>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 sm:h-6 sm:w-6 p-0 hover:bg-zinc-700 transition-colors touch-manipulation"
                  onClick={handleCopyAddress}
                  aria-label="Copy contract address"
                  title="Copy address to clipboard"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-green-400" />
                  ) : (
                    <Copy className="h-3.5 w-3.5 text-zinc-400 group-hover:text-zinc-300 transition-colors" />
                  )}
                </Button>
              </div>

              {/* Social Links */}
              {(socialLinks.twitter || socialLinks.telegram || socialLinks.website) && (
                <div className="flex items-center gap-2">
                  {socialLinks.twitter && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 p-0 hover:bg-zinc-700"
                      asChild
                    >
                      <a
                        href={socialLinks.twitter}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Twitter"
                      >
                        <Twitter className="h-4 w-4 text-zinc-400 hover:text-blue-400" />
                      </a>
                    </Button>
                  )}
                  {socialLinks.telegram && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 p-0 hover:bg-zinc-700"
                      asChild
                    >
                      <a
                        href={socialLinks.telegram}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Telegram"
                      >
                        <MessageCircle className="h-4 w-4 text-zinc-400 hover:text-blue-400" />
                      </a>
                    </Button>
                  )}
                  {socialLinks.website && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 p-0 hover:bg-zinc-700"
                      asChild
                    >
                      <a
                        href={socialLinks.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Website"
                      >
                        <Globe className="h-4 w-4 text-zinc-400 hover:text-blue-400" />
                      </a>
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {wrapperMeta && (
          <div className="mt-4 pt-3 border-t border-zinc-800 text-xs sm:text-sm text-zinc-300">
            <div className="w-full flex justify-center">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 text-zinc-400 hover:text-zinc-200 transition-colors"
                onClick={() => setMetricsOpen((open) => !open)}
              >
                <span className="font-medium">Stat</span>
                <ChevronDown
                  className={cn(
                    "h-3 w-3 transition-transform",
                    metricsOpen ? "rotate-180" : "rotate-0",
                  )}
                />
              </button>
            </div>

            {metricsOpen && (
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                {/* Left Panel: Token Data */}
                <div className="space-y-2">
                  <div className="text-[11px] uppercase tracking-wide text-zinc-500">Token Data</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="w-full rounded-lg border border-zinc-800 bg-zinc-900/60 px-2 py-1.5">
                      <div className="text-[10px] uppercase tracking-wide text-zinc-500">RT Address</div>
                      <a
                        href={getAddressExplorerUrl(wrapperMeta.rt || details.rtAddress || details.tokenAddress)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block font-mono text-[11px] text-zinc-300 hover:text-zinc-100 hover:underline decoration-dotted underline-offset-2 truncate"
                      >
                        {truncateAddress(wrapperMeta.rt || details.rtAddress || details.tokenAddress)}
                      </a>
                    </div>
                    <div className="w-full rounded-lg border border-zinc-800 bg-zinc-900/60 px-2 py-1.5">
                      <div className="text-[10px] uppercase tracking-wide text-zinc-500">Launched</div>
                      <div className="text-[11px] text-zinc-300">
                        {formatTimestamp(wrapperMeta.launchTime)}
                      </div>
                    </div>
                    <div className="w-full rounded-lg border border-zinc-800 bg-zinc-900/60 px-2 py-1.5">
                      <div className="text-[10px] uppercase tracking-wide text-zinc-500">Supply Locked</div>
                      <div className="text-[11px] text-zinc-300">
                        {formatAmount(wrapperMeta.totalLocked, 6, 0)} RT
                      </div>
                    </div>
                    <div className="w-full rounded-lg border border-zinc-800 bg-zinc-900/60 px-2 py-1.5">
                      <div className="text-[10px] uppercase tracking-wide text-zinc-500">Revenue Injected</div>
                      <div className="text-[11px] text-zinc-300">
                        {formatAmount(wrapperMeta.totalRoyaltiesHarvested, 18, 0)} WIP
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Panel: IP Metadata */}
                <div className="space-y-2">
                  <div className="text-[11px] uppercase tracking-wide text-zinc-500">IP Metadata</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="w-full rounded-lg border border-zinc-800 bg-zinc-900/60 px-2 py-1.5">
                      <div className="text-[10px] uppercase tracking-wide text-zinc-500">IPID</div>
                      {details.ipId ? (
                        <a
                          href={getIpIdExplorerUrl(details.ipId)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block font-mono text-[11px] text-zinc-300 hover:text-zinc-100 hover:underline decoration-dotted underline-offset-2 truncate"
                        >
                          {truncateAddress(details.ipId)}
                        </a>
                      ) : (
                        <div className="text-[11px] text-zinc-500">—</div>
                      )}
                    </div>
                    <div className="w-full rounded-lg border border-zinc-800 bg-zinc-900/60 px-2 py-1.5">
                      <div className="text-[10px] uppercase tracking-wide text-zinc-500">Creator</div>
                      {creator ? (
                        <a
                          href={getAddressExplorerUrl(creator)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block font-mono text-[11px] text-zinc-300 hover:text-zinc-100 hover:underline decoration-dotted underline-offset-2 truncate"
                        >
                          {truncateAddress(creator)}
                        </a>
                      ) : (
                        <div className="text-[11px] text-zinc-500">—</div>
                      )}
                    </div>
                    <div className="w-full rounded-lg border border-zinc-800 bg-zinc-900/60 px-2 py-1.5">
                      <div className="text-[10px] uppercase tracking-wide text-zinc-500">Metadata URI</div>
                      {metadataUri ? (
                        <a
                          href={metadataHref || "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block text-[11px] text-zinc-300 hover:text-zinc-100 hover:underline decoration-dotted underline-offset-2 truncate"
                        >
                          {metadataUri}
                        </a>
                      ) : (
                        <div className="text-[11px] text-zinc-500">—</div>
                      )}
                    </div>
                    <div className="w-full rounded-lg border border-zinc-800 bg-zinc-900/60 px-2 py-1.5">
                      <div className="text-[10px] uppercase tracking-wide text-zinc-500">Media Type</div>
                      <div className="text-[11px] text-zinc-300">
                        {details.mediaType ?? "—"}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

