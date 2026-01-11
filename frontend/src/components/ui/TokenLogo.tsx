"use client"

import Image from "next/image"
import { useState, useEffect } from "react"
import { Loader2 } from "lucide-react"
import { logger } from "@/lib/logger"

interface TokenLogoProps {
  tokenAddress?: string
  ipId?: string
  fallbackName?: string
  size?: "sm" | "md" | "lg" | "xl"
  className?: string
}

const sizeClasses = {
  sm: "w-8 h-8",
  md: "w-12 h-12",
  lg: "w-16 h-16",
  xl: "w-24 h-24",
} as const

const sizePixels: Record<NonNullable<TokenLogoProps["size"]>, number> = {
  sm: 32,
  md: 48,
  lg: 64,
  xl: 96,
}

export default function TokenLogo({
  tokenAddress,
  ipId,
  fallbackName = "Token",
  size = "md",
  className = "",
}: TokenLogoProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    const fetchTokenImage = async () => {
      if (!ipId && !tokenAddress) {
        setIsLoading(false)
        setHasError(true)
        return
      }

      try {
        setIsLoading(true)
        setHasError(false)

        // Try to fetch from Story Protocol API
        const storyApiUrl = `https://staging-api.storyprotocol.net/api/v4/assets/${ipId || tokenAddress}`
        
        const response = await fetch(storyApiUrl, {
          headers: {
            "Content-Type": "application/json",
          },
        })

        if (response.ok) {
          const data = await response.json()
          const imageUrl = data?.metadata?.image || data?.image || null
          
          if (imageUrl) {
            setImageUrl(imageUrl)
            setIsLoading(false)
            return
          }
        }

        // If Story Protocol fails, try IPFS gateway if ipId looks like IPFS hash
        if (ipId && ipId.startsWith("Qm")) {
          setImageUrl(`https://ipfs.io/ipfs/${ipId}`)
          setIsLoading(false)
          return
        }

        // Fallback to error state
        setHasError(true)
        setIsLoading(false)
      } catch (error) {
        logger.warn("Error fetching token image:", error)
        setHasError(true)
        setIsLoading(false)
      }
    }

    fetchTokenImage()
  }, [ipId, tokenAddress])

  const sizeClass = sizeClasses[size]
  const sizePx = sizePixels[size]

  // Loading state
  if (isLoading) {
    return (
      <div
        className={`${sizeClass} ${className} rounded-full bg-muted/20 flex items-center justify-center border border-border/30`}
      >
        <Loader2 className="w-1/2 h-1/2 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Error state or no image - show fallback
  if (hasError || !imageUrl) {
    const initials = fallbackName
      .split(" ")
      .map((word) => word[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)

    return (
      <div
        className={`${sizeClass} ${className} rounded-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center border border-primary/30 font-bold text-primary`}
      >
        {initials}
      </div>
    )
  }

  // Success state - show actual image
  return (
    <div className={`${sizeClass} ${className} relative`}>
      <Image
        src={imageUrl}
        alt={fallbackName}
        width={sizePx}
        height={sizePx}
        className="w-full h-full rounded-full object-cover border border-border/30"
        onError={() => {
          setHasError(true)
          setImageUrl(null)
        }}
      />
    </div>
  )
}
