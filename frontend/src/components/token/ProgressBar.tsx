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

const TARGET_RAISE_IP = parseEther("1") // 1 IP
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
  const targetRaiseFormatted = formatIP(targetRaiseBigInt)
  const isNearCompletion = animatedProgress > 90
  const isGraduatedState = isGraduated || progress >= 100

  // State for graduation modal
  const [showGraduationModal, setShowGraduationModal] = useState(false)

  // Auto-open graduation modal when progress reaches 100% (only if not already graduated)
  useEffect(() => {
    if (isGraduatedState && !isGraduated && !showGraduationModal) {
      // Check sessionStorage to see if modal was already shown
      const shown = sessionStorage.getItem("sovry-graduation-modal-shown")
      if (shown !== "true") {
        setShowGraduationModal(true)
      }
    }
  }, [isGraduatedState, isGraduated, showGraduationModal])

  return (
    <div className={cn("space-y-3", className)}>
      {/* Header with labels */}
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold text-zinc-50">Progress to PiperX</span>
        <span className="text-zinc-400 font-mono">
          {totalRaisedFormatted} IP / {targetRaiseFormatted} IP ({progress.toFixed(1)}%)
        </span>
      </div>

      {/* Progress Bar Container */}
      <div className="relative">
        {/* Custom Progress Bar with Gradient */}
        <div className="relative h-4 sm:h-6 w-full overflow-hidden rounded-full bg-zinc-800/50 border border-zinc-800">
          {/* Animated Progress Fill with Gradient */}
          <div
            className={cn(
              "h-full rounded-full transition-all duration-700 ease-out relative",
              isGraduatedState
                ? "bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-600 shadow-[0_0_20px_rgba(250,204,21,0.5)]"
                : "bg-gradient-to-r from-green-400 to-green-600",
              isNearCompletion && !isGraduatedState && "shadow-[0_0_20px_rgba(34,197,94,0.5)]"
            )}
            style={{
              width: `${Math.min(Math.max(animatedProgress, 0), 100)}%`,
            }}
            role="progressbar"
            aria-valuenow={animatedProgress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            {/* Shimmer effect when near completion or graduated */}
            {(isNearCompletion || isGraduatedState) && (
              <div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                style={{
                  backgroundSize: "200% 100%",
                  animation: "shimmer 2s infinite",
                }}
              />
            )}
          </div>
        </div>

        {/* Milestone Markers - Hidden on mobile, shown on desktop */}
        <div className="absolute inset-0 hidden sm:flex items-center pointer-events-none">
          {MILESTONES.map((milestone) => (
            <div
              key={milestone}
              className="absolute flex flex-col items-center"
              style={{ left: `${milestone}%`, transform: "translateX(-50%)" }}
            >
              {/* Marker Dot */}
              <div
                className={cn(
                  "w-1.5 h-1.5 rounded-full transition-all duration-300",
                  animatedProgress >= milestone
                    ? isGraduatedState
                      ? "bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.6)]"
                      : "bg-green-400 shadow-[0_0_8px_rgba(34,197,94,0.6)]"
                    : "bg-zinc-600"
                )}
              />
            </div>
          ))}
        </div>
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

