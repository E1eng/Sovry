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
// Alert replaced with inline divs for consistency
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

        <div className="space-y-3 pt-3">
          {/* Preset Buttons */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Presets</label>
            <div className="flex gap-1.5">
              {SLIPPAGE_PRESETS.map((preset) => (
                <Button
                  key={preset}
                  variant={customSlippage === preset.toString() ? "default" : "outline"}
                  size="sm"
                  onClick={() => handlePresetClick(preset)}
                  className="flex-1 h-8 text-xs font-mono"
                >
                  {preset}%
                </Button>
              ))}
            </div>
          </div>

          {/* Custom Input */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Custom</label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={customSlippage}
                onChange={(e) => handleCustomChange(e.target.value)}
                placeholder="1.0"
                step="0.1"
                min={MIN_SLIPPAGE}
                max={MAX_SLIPPAGE}
                className={cn("h-8 text-xs font-mono", error && "border-secondary focus-visible:ring-secondary")}
              />
              <span className="text-[10px] font-mono text-muted-foreground">%</span>
            </div>
            {error && (
              <p className="text-[10px] font-mono text-secondary">{error}</p>
            )}
            <p className="text-[10px] font-mono text-muted-foreground">
              Range: {MIN_SLIPPAGE}% – {MAX_SLIPPAGE}%
            </p>
          </div>

          {/* Warning */}
          {showWarning && (
            <div className="flex items-center gap-1.5 rounded-sm border border-secondary/30 bg-secondary/5 px-2.5 py-1.5">
              <AlertTriangle className="h-3 w-3 text-secondary flex-shrink-0" />
              <span className="text-[10px] font-mono text-secondary">High slippage — your trade may be frontrun.</span>
            </div>
          )}

          {/* Save Button */}
          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="h-8 text-xs font-mono"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!!error || !customSlippage}
              className="h-8 text-xs font-mono"
            >
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

