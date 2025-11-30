"use client"

import { useState } from "react"
import Image from "next/image"
import { Copy, Check, Twitter, Globe, MessageCircle, Verified, CheckCircle2 } from "lucide-react"
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

  // Extract social links from metadata if available
  // This would come from enriched data or IP metadata
  const socialLinks: SocialLinks = {
    // TODO: Extract from details.metadata or details.launchInfo when available
  }

  const isGraduated = details.launchInfo?.graduated || false
  const creator = details.launchInfo?.creator
  const totalRaised = details.launchInfo?.totalRaised
  const imageUrl = details.imageUrl || "/placeholder-ip.png"
  const ticker = details.symbol || "TOKEN"
  const name = details.name || ticker

  // Format final raise amount
  const formatFinalRaise = (amount: bigint | undefined) => {
    if (!amount) return null
    const formatted = (Number(amount) / 1e18).toFixed(3)
    return `${formatted} IP`
  }

  const truncateAddress = (address: string) => {
    if (!address || address.length < 10) return address
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className="p-4 sm:p-6">
        <div className="flex flex-col items-start gap-4 sm:gap-6">
          {/* Token Image */}
          <div className="relative w-20 h-20 sm:w-20 sm:h-20 flex-shrink-0 rounded-xl overflow-hidden bg-zinc-800 border border-zinc-800">
            <Image
              src={imageUrl}
              alt={name}
              fill
              className="object-cover"
              loading="lazy"
              unoptimized
            />
          </div>

          {/* Token Info */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-2">
              <h1 className="text-2xl sm:text-3xl font-bold text-zinc-50 truncate">
                {ticker}
              </h1>
              {isGraduated ? (
                <Badge
                  variant="default"
                  className="bg-gradient-to-r from-yellow-500/20 to-amber-500/20 text-yellow-400 border-yellow-500/50 flex items-center gap-1.5 font-semibold"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  GRADUATED ✓
                </Badge>
              ) : (
                <Badge
                  variant="default"
                  className="bg-green-500/20 text-green-400 border-green-500/50 flex items-center gap-1.5"
                >
                  <Verified className="h-3 w-3" />
                  Verified
                </Badge>
              )}
            </div>
            <p className="text-sm sm:text-base text-zinc-400 mb-3 truncate">
              {name}
            </p>
            {/* Final Raise Amount for Graduated Tokens */}
            {isGraduated && totalRaised && (
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs sm:text-sm text-zinc-500">Final Raise:</span>
                <span className="text-xs sm:text-sm font-semibold text-yellow-400">
                  {formatFinalRaise(totalRaised)}
                </span>
              </div>
            )}

            {/* Creator Address */}
            {creator && (
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs sm:text-sm text-zinc-500">Created by</span>
                <span className="text-xs sm:text-sm font-medium text-zinc-300">
                  {truncateAddress(creator)}
                </span>
              </div>
            )}

            {/* Contract Address with Copy */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800/50 rounded-lg border border-zinc-800 group">
                <span className="text-xs sm:text-sm text-zinc-400 font-mono">
                  {truncateAddress(details.tokenAddress)}
                </span>
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
      </CardContent>
    </Card>
  )
}

