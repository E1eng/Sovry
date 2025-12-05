"use client"

import { useDynamicContext } from "@dynamic-labs/sdk-react-core"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import TokenLogo from "@/components/ui/TokenLogo"

export interface SwapInputProps {
  label: string
  token: "IP" | string // "IP" for native IP, or token address
  tokenSymbol: string
  amount: string
  onAmountChange: (amount: string) => void
  balance?: string | number
  tokenDecimals?: number
  disabled?: boolean
  className?: string
}

/**
 * Format number with commas for thousands
 */
function formatNumberWithCommas(value: string | number): string {
  if (!value) return ""
  const num = typeof value === "string" ? parseFloat(value) : value
  if (isNaN(num)) return value.toString()
  
  // Split into integer and decimal parts
  const parts = num.toString().split(".")
  const integerPart = parts[0]
  const decimalPart = parts[1]
  
  // Add commas to integer part
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  
  return decimalPart ? `${formattedInteger}.${decimalPart}` : formattedInteger
}

/**
 * Validate and sanitize input value
 * Returns cleaned value or null if invalid
 */
function sanitizeInput(
  value: string,
  maxDecimals: number
): string | null {
  // Allow empty string
  if (value === "") return ""

  // Remove commas and spaces for validation
  const cleanValue = value.replace(/[, ]/g, "")

  // Check if it's a valid number format (digits, optional decimal point, optional digits)
  if (!/^\d*\.?\d*$/.test(cleanValue)) {
    return null // Invalid characters
  }

  // Check decimal places
  const decimalIndex = cleanValue.indexOf(".")
  if (decimalIndex !== -1) {
    const decimalPart = cleanValue.slice(decimalIndex + 1)
    if (decimalPart.length > maxDecimals) {
      // Truncate to max decimals instead of rejecting
      return cleanValue.slice(0, decimalIndex + 1 + maxDecimals)
    }
  }

  return cleanValue
}

export function SwapInput({
  label,
  token,
  tokenSymbol,
  amount,
  onAmountChange,
  balance,
  tokenDecimals = 18,
  disabled: externalDisabled,
  className,
}: SwapInputProps) {
  const { primaryWallet } = useDynamicContext()
  const isConnected = !!primaryWallet
  const isDisabled = externalDisabled || !isConnected

  // Determine max decimals (18 for IP, token decimals for others)
  const maxDecimals = token === "IP" ? 18 : tokenDecimals

  // Format balance for display
  const formattedBalance = balance
    ? formatNumberWithCommas(balance)
    : "0"

  // Handle input change with validation
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    const sanitized = sanitizeInput(value, maxDecimals)
    
    if (sanitized !== null) {
      // Check if exceeds balance (warn but allow typing)
      if (balance !== undefined) {
        const numValue = parseFloat(sanitized)
        const maxNum = typeof balance === "string" ? parseFloat(balance) : balance
        if (!isNaN(numValue) && !isNaN(maxNum) && numValue > maxNum) {
          // Still allow typing but the parent can show warning
          onAmountChange(sanitized)
          return
        }
      }
      
      onAmountChange(sanitized)
    }
  }

  // Handle MAX button click
  const handleMaxClick = () => {
    if (balance && parseFloat(balance.toString()) > 0) {
      const maxBalance = balance.toString()
      // Remove trailing zeros and unnecessary decimals
      const cleaned = parseFloat(maxBalance).toString()
      onAmountChange(cleaned)
    }
  }

  // Format display value with commas (only when not actively typing)
  const displayValue = amount ? formatNumberWithCommas(amount) : ""

  return (
    <div className={cn("space-y-2", className)}>
      <label className="text-xs text-zinc-400 font-medium">{label}</label>
      
      {/* Input Container */}
      <div className="relative flex items-center gap-2">
        <Input
          type="text"
          inputMode="decimal"
          value={displayValue}
          onChange={handleInputChange}
          placeholder="0.0"
          disabled={isDisabled}
          className={cn(
            "text-2xl font-semibold h-16 pr-24",
            isDisabled && "opacity-50 cursor-not-allowed"
          )}
        />
        
        {/* Token Selector on Right */}
        <div className="absolute right-2 flex items-center gap-2 px-2">
          {token !== "IP" && (
            <div className="flex-shrink-0">
              <TokenLogo
                tokenAddress={token}
                size="sm"
                className="w-6 h-6"
              />
            </div>
          )}
          <span className="text-sm font-semibold text-zinc-50 min-w-[60px] text-right">
            {tokenSymbol}
          </span>
        </div>
      </div>

      {/* Balance and MAX Button */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-500">
          Balance: {formattedBalance} {tokenSymbol}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleMaxClick}
          disabled={isDisabled || !balance || parseFloat(balance.toString()) <= 0}
          className="h-6 px-2 text-xs text-sovry-green hover:text-sovry-green/80 hover:bg-sovry-green/10"
        >
          MAX
        </Button>
      </div>
    </div>
  )
}

