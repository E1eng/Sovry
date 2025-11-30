"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"
import { trackEvent } from "@/lib/analytics"

export interface SlippageSettingsProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  slippage: string
  onSlippageChange: (slippage: string) => void
}

const SLIPPAGE_PRESETS = [0.5, 1, 2]
const MIN_SLIPPAGE = 0.1
const MAX_SLIPPAGE = 10
const WARNING_THRESHOLD = 3

const STORAGE_KEY = "sovry-slippage-tolerance"

export function SlippageSettings({
  open,
  onOpenChange,
  slippage,
  onSlippageChange,
}: SlippageSettingsProps) {
  const [customSlippage, setCustomSlippage] = useState(slippage)
  const [error, setError] = useState<string | null>(null)

  // Sync local state with prop when dialog opens
  useEffect(() => {
    if (open) {
      setCustomSlippage(slippage)
      setError(null)
    }
  }, [slippage, open])

  const handlePresetClick = (preset: number) => {
    setCustomSlippage(preset.toString())
    setError(null)
  }

  const handleCustomChange = (value: string) => {
    setCustomSlippage(value)

    if (!value || value === "") {
      setError(null)
      return
    }

    const numValue = parseFloat(value)

    if (isNaN(numValue)) {
      setError("Please enter a valid number")
      return
    }

    if (numValue < MIN_SLIPPAGE) {
      setError(`Minimum slippage is ${MIN_SLIPPAGE}%`)
      return
    }

    if (numValue > MAX_SLIPPAGE) {
      setError(`Maximum slippage is ${MAX_SLIPPAGE}%`)
      return
    }

    setError(null)
  }

  const handleSave = () => {
    const numValue = parseFloat(customSlippage)

    if (isNaN(numValue) || numValue < MIN_SLIPPAGE || numValue > MAX_SLIPPAGE) {
      setError("Please enter a valid slippage percentage")
      return
    }

    // Save to localStorage
    localStorage.setItem(STORAGE_KEY, customSlippage)

    // Track slippage change
    trackEvent("slippage_changed", {
      oldValue: slippage,
      newValue: customSlippage,
    })

    // Update parent
    onSlippageChange(customSlippage)
    onOpenChange(false)
  }

  const slippageValue = parseFloat(customSlippage)
  const showWarning = !isNaN(slippageValue) && slippageValue > WARNING_THRESHOLD

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Slippage Tolerance</DialogTitle>
          <DialogDescription>
            Set your maximum acceptable price slippage for trades. Higher slippage may result in worse execution prices.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Preset Buttons */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-300">Presets</label>
            <div className="flex gap-2">
              {SLIPPAGE_PRESETS.map((preset) => (
                <Button
                  key={preset}
                  variant={customSlippage === preset.toString() ? "default" : "outline"}
                  size="sm"
                  onClick={() => handlePresetClick(preset)}
                  className="flex-1"
                >
                  {preset}%
                </Button>
              ))}
            </div>
          </div>

          {/* Custom Input */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-300">Custom</label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={customSlippage}
                onChange={(e) => handleCustomChange(e.target.value)}
                placeholder="1.0"
                step="0.1"
                min={MIN_SLIPPAGE}
                max={MAX_SLIPPAGE}
                className={cn(error && "border-red-500 focus-visible:ring-red-500")}
              />
              <span className="text-sm text-zinc-400 min-w-[24px]">%</span>
            </div>
            {error && (
              <p className="text-xs text-red-400">{error}</p>
            )}
            <p className="text-xs text-zinc-500">
              Range: {MIN_SLIPPAGE}% - {MAX_SLIPPAGE}%
            </p>
          </div>

          {/* Warning */}
          {showWarning && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                High slippage! Your trade may be frontrun or executed at a significantly worse price.
              </AlertDescription>
            </Alert>
          )}

          {/* Save Button */}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!!error || !customSlippage}
            >
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

