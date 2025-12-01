"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface RoyaltyConfigurationProps {
  value: number;
  onChange: (value: number) => void;
  className?: string;
}

const PRESETS = [25, 50, 75, 100] as const;

export function RoyaltyConfiguration({
  value,
  onChange,
  className,
}: RoyaltyConfigurationProps) {
  // Clamp value to valid range
  const clampedValue = Math.max(1, Math.min(100, value));
  const claimablePercentage = 100 - clampedValue;

  // Trigger animations on value changes (as specified in plan)
  useEffect(() => {
    // Animations are automatically triggered by the key prop on motion.div
    // This useEffect ensures proper re-rendering when value changes
  }, [clampedValue]);

  const handleSliderChange = (newValue: number[]) => {
    const newVal = Math.max(1, Math.min(100, newValue[0] ?? 1));
    onChange(newVal);
  };

  const handlePresetClick = (preset: number) => {
    onChange(preset);
  };

  const isPresetActive = (preset: number) => {
    return clampedValue === preset;
  };

  return (
    <div className={cn("space-y-6", className)}>
      {/* Large Visual Indicator */}
      <div className="flex flex-col items-center justify-center py-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={clampedValue}
            initial={{ scale: 1.2, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="text-7xl font-bold text-sovry-green tabular-nums"
          >
            {clampedValue}%
          </motion.div>
        </AnimatePresence>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="text-sm text-zinc-400 mt-2"
        >
          Royalty Lock Percentage
        </motion.p>
      </div>

      {/* Preset Buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        <Label className="text-zinc-400 text-sm font-medium uppercase tracking-wide w-full">
          Quick Presets
        </Label>
        <div className="flex gap-2 w-full">
          {PRESETS.map((preset) => (
            <motion.div
              key={preset}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Button
                type="button"
                variant={isPresetActive(preset) ? "default" : "outline"}
                size="sm"
                onClick={() => handlePresetClick(preset)}
                className={cn(
                  "flex-1 transition-all",
                  isPresetActive(preset)
                    ? "bg-sovry-green text-black"
                    : "border-zinc-700 hover:border-sovry-green/50"
                )}
              >
                {preset}%
              </Button>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Slider */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-zinc-400 text-sm font-medium uppercase tracking-wide">
            Custom Percentage
          </Label>
          <span className="text-sm font-medium text-zinc-50 tabular-nums">
            {clampedValue}%
          </span>
        </div>
        <Slider
          value={[clampedValue]}
          min={1}
          max={100}
          step={1}
          onValueChange={handleSliderChange}
          className="w-full"
        />
        <motion.p
          initial={{ opacity: 0.7 }}
          animate={{ opacity: 1 }}
          className="text-xs text-zinc-500 mt-2"
        >
          This percentage of trading royalties will be locked in the bonding curve
        </motion.p>
      </div>

      {/* Visual Preview - Two Progress Bars */}
      <div className="space-y-3">
        <Label className="text-zinc-400 text-sm font-medium uppercase tracking-wide">
          Royalty Distribution Preview
        </Label>
        <div className="grid grid-cols-2 gap-4">
          {/* Locked in Curve */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-400">Locked in Curve</span>
              <span className="font-medium text-sovry-green tabular-nums">
                {clampedValue}%
              </span>
            </div>
            <div className="relative h-3 w-full overflow-hidden rounded-full bg-zinc-800">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${clampedValue}%` }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="h-full bg-sovry-green rounded-full"
              />
            </div>
          </div>

          {/* Claimable */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-400">Claimable</span>
              <span className="font-medium text-sovry-pink tabular-nums">
                {claimablePercentage}%
              </span>
            </div>
            <div className="relative h-3 w-full overflow-hidden rounded-full bg-zinc-800">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${claimablePercentage}%` }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="h-full bg-sovry-pink rounded-full"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

