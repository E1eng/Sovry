"use client"

import { useEffect, useRef } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Trophy, ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"
import confetti from "canvas-confetti"
import { trackEvent } from "@/lib/analytics"

export interface GraduationModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tokenTicker: string
  tokenName: string
  tokenAddress?: string
  className?: string
}

const SESSION_STORAGE_KEY = "sovry-graduation-modal-shown"

export function GraduationModal({
  open,
  onOpenChange,
  tokenTicker,
  tokenName,
  tokenAddress,
  className,
}: GraduationModalProps) {
  const confettiFiredRef = useRef(false)
  const soundPlayedRef = useRef(false)

  // Fire confetti when modal opens
  useEffect(() => {
    if (!open || confettiFiredRef.current) return

    // Check if already shown in this session
    const shown = sessionStorage.getItem(SESSION_STORAGE_KEY)
    if (shown === "true") {
      onOpenChange(false)
      return
    }

    confettiFiredRef.current = true

    // Create confetti effect
    const duration = 3000
    const animationEnd = Date.now() + duration
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 }

    function randomInRange(min: number, max: number) {
      return Math.random() * (max - min) + min
    }

    const interval = setInterval(() => {
      const timeLeft = animationEnd - Date.now()

      if (timeLeft <= 0) {
        clearInterval(interval)
        return
      }

      const particleCount = 50 * (timeLeft / duration)

      // Launch confetti from both sides
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
        colors: ["#FFD700", "#FFA500", "#FF6B6B", "#4ECDC4", "#45B7D1", "#FFA07A"],
      })

      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
        colors: ["#FFD700", "#FFA500", "#FF6B6B", "#4ECDC4", "#45B7D1", "#FFA07A"],
      })
    }, 250)

    // Mark as shown in session storage
    sessionStorage.setItem(SESSION_STORAGE_KEY, "true")

    // Play sound effect (optional - using Web Audio API)
    // Note: This requires user interaction first due to browser autoplay policies
    if (!soundPlayedRef.current) {
      try {
        // Check if AudioContext is available
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext
        if (!AudioContext) return

        const audioContext = new AudioContext()
        
        // Resume audio context if suspended (required after user interaction)
        if (audioContext.state === "suspended") {
          audioContext.resume()
        }

        const oscillator = audioContext.createOscillator()
        const gainNode = audioContext.createGain()

        oscillator.connect(gainNode)
        gainNode.connect(audioContext.destination)

        // Create a celebratory sound (chord progression)
        oscillator.type = "sine"
        oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime) // C5
        oscillator.frequency.setValueAtTime(659.25, audioContext.currentTime + 0.1) // E5
        oscillator.frequency.setValueAtTime(783.99, audioContext.currentTime + 0.2) // G5

        gainNode.gain.setValueAtTime(0.2, audioContext.currentTime)
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.6)

        oscillator.start(audioContext.currentTime)
        oscillator.stop(audioContext.currentTime + 0.6)

        soundPlayedRef.current = true
      } catch (error) {
        // Silently fail if audio is not supported or user hasn't interacted
        // This is expected behavior - browsers require user interaction for audio
      }
    }

    return () => {
      clearInterval(interval)
    }
  }, [open, onOpenChange])

  // Get PiperX DEX URL (you may need to adjust this based on your DEX setup)
  const getPiperXDEXUrl = () => {
    if (!tokenAddress) {
      // Fallback to general DEX URL if token address not available
      return "https://piperx.io" // Replace with actual PiperX DEX URL
    }
    // Construct DEX URL with token address
    // Adjust this based on your DEX's URL structure
    return `https://piperx.io/token/${tokenAddress}` // Replace with actual URL pattern
  }

  const handleViewOnPiperX = () => {
    trackEvent("piperx_link_clicked", {
      tokenAddress,
      tokenTicker,
      source: "graduation_modal",
    })
    window.open(getPiperXDEXUrl(), "_blank", "noopener,noreferrer")
  }

  const handleContinueTrading = () => {
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "sm:max-w-md bg-gradient-to-br from-yellow-900/20 via-amber-900/20 to-orange-900/20 border-yellow-500/30",
          className
        )}
      >
        <DialogHeader className="text-center space-y-4">
          {/* Trophy Icon */}
          <div className="flex justify-center">
            <div className="relative">
              <Trophy className="h-20 w-20 text-yellow-400 drop-shadow-[0_0_20px_rgba(250,204,21,0.6)]" />
              <div className="absolute inset-0 bg-yellow-400/20 blur-2xl rounded-full" />
            </div>
          </div>

          <DialogTitle className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-amber-400 to-orange-400">
            🎉 Graduating to PiperX!
          </DialogTitle>

          <DialogDescription className="text-zinc-300 space-y-2">
            <div className="font-semibold text-lg text-yellow-300">
              {tokenTicker} - {tokenName}
            </div>
            <p className="text-sm text-zinc-400">
              Liquidity pool is now live on PiperX DEX
            </p>
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 pt-4">
          {/* View on PiperX Button */}
          <Button
            onClick={handleViewOnPiperX}
            className="w-full bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 text-black font-bold text-lg py-6 shadow-lg shadow-yellow-500/30"
          >
            <ExternalLink className="h-5 w-5 mr-2" />
            View on PiperX
          </Button>

          {/* Continue Trading Button */}
          <Button
            onClick={handleContinueTrading}
            variant="outline"
            className="w-full border-yellow-500/50 text-yellow-300 hover:bg-yellow-500/10 hover:border-yellow-400 font-semibold py-6"
          >
            Continue Trading
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

