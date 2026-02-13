"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { formatEther, parseEther } from "viem"
import { GraduationModal } from "./GraduationModal"

export interface ProgressToGraduationProps {
  totalRaised: bigint | string | number
  targetRaise?: bigint | string | number
  tokenTicker?: string
  tokenName?: string
  tokenAddress?: string
  isGraduated?: boolean
  className?: string
}

const TARGET_RAISE_IP = parseEther("10000") // 8 IP graduation threshold
const MILESTONES = [25, 50, 75]

export function ProgressToGraduation({
  totalRaised,
  targetRaise = TARGET_RAISE_IP,
  tokenTicker = "TOKEN",
  tokenName = "Token",
  tokenAddress,
  isGraduated = false,
  className,
}: ProgressToGraduationProps) {
  // Convert to bigint for calculations
  const totalRaisedBigInt =
    typeof totalRaised === "string"
      ? parseEther(totalRaised)
      : typeof totalRaised === "number"
      ? parseEther(totalRaised.toString())
      : totalRaised

  const targetRaiseBigInt =
    typeof targetRaise === "string"
      ? parseEther(targetRaise)
      : typeof targetRaise === "number"
      ? parseEther(targetRaise.toString())
      : targetRaise

  // Calculate progress percentage
  const progress =
    targetRaiseBigInt > 0n
      ? Math.min(100, Math.max(0, (Number(totalRaisedBigInt) / Number(targetRaiseBigInt)) * 100))
      : 0

  // Animated progress value for smooth animation
  const [animatedProgress, setAnimatedProgress] = useState(0)

  // Animate progress on mount and updates
  useEffect(() => {
    const duration = 1000 // 1 second animation
    const startTime = Date.now()
    const startProgress = animatedProgress
    const targetProgress = progress

    if (startProgress === targetProgress) return

    const animate = () => {
      const elapsed = Date.now() - startTime
      const progressRatio = Math.min(1, elapsed / duration)
      
      // Easing function (ease-out)
      const eased = 1 - Math.pow(1 - progressRatio, 3)
      
      const currentProgress = startProgress + (targetProgress - startProgress) * eased
      setAnimatedProgress(currentProgress)

      if (progressRatio < 1) {
        requestAnimationFrame(animate)
      } else {
        setAnimatedProgress(targetProgress)
      }
    }

    requestAnimationFrame(animate)
  }, [progress, animatedProgress])

  // Format IP amounts for display
  const formatIP = (amount: bigint): string => {
    const formatted = formatEther(amount)
    const num = parseFloat(formatted)
    
    if (num >= 1) {
      return num.toFixed(3)
    } else if (num >= 0.001) {
      return num.toFixed(4)
    } else {
      return num.toFixed(6)
    }
  }

  const totalRaisedFormatted = formatIP(totalRaisedBigInt)

  // For the target threshold, show a clean whole number (e.g. 10,000 IP)
  // instead of a decimal representation like 10000.000 IP.
  const targetRaiseNumber = parseFloat(formatEther(targetRaiseBigInt))
  const targetRaiseDisplay = Number.isFinite(targetRaiseNumber)
    ? targetRaiseNumber.toLocaleString()
    : formatEther(targetRaiseBigInt)
  const isNearCompletion = animatedProgress > 90

  // IMPORTANT: Treat "graduated" purely as an on-chain/subgraph state.
  // Progress hitting 100% should NOT be interpreted as real graduation,
  // otherwise the UI can show a graduation modal while the bonding curve
  // is still active and the token is still tradable.
  const isGraduatedState = isGraduated

  // State for graduation modal
  const [showGraduationModal, setShowGraduationModal] = useState(false)

  // NOTE: We no longer auto-open this modal based on progress alone.
  // On-chain graduation is already handled via useGraduationEvent on the
  // pool page, which will open a separate GraduationModal when the
  // actual Graduated event fires. Keeping this modal closed by default
  // avoids double/confusing graduation notifications.

  return (
    <div className={cn("space-y-2.5", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Progress</span>
        <span className={cn(
          "text-xs font-mono tabular-nums font-semibold",
          isGraduatedState ? "text-secondary" : isNearCompletion ? "text-primary" : "text-foreground"
        )}>
          {progress.toFixed(1)}%
        </span>
      </div>

      {/* Progress Bar */}
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted/60 border border-border/50">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-700 ease-out",
            isGraduatedState ? "bg-secondary" : "bg-primary",
            !isGraduatedState && animatedProgress > 0 && "shadow-[0_0_8px_rgba(204,255,0,0.4)]"
          )}
          style={{ width: `${Math.min(Math.max(animatedProgress, 0), 100)}%` }}
          role="progressbar"
          aria-valuenow={animatedProgress}
          aria-valuemin={0}
          aria-valuemax={100}
        />
        {/* Milestone markers */}
        {MILESTONES.map((milestone) => (
          <div
            key={milestone}
            className="absolute top-0 bottom-0 w-px bg-border/40"
            style={{ left: `${milestone}%` }}
          />
        ))}
      </div>

      {/* Raised / Target */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono text-muted-foreground">
          {totalRaisedFormatted} IP raised
        </span>
        <span className="text-[10px] font-mono text-muted-foreground">
          {targetRaiseDisplay} IP target
        </span>
      </div>

      {/* Graduation Modal */}
      <GraduationModal
        open={showGraduationModal}
        onOpenChange={setShowGraduationModal}
        tokenTicker={tokenTicker}
        tokenName={tokenName}
        tokenAddress={tokenAddress}
      />
    </div>
  )
}

