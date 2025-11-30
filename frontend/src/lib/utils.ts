import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format market cap to readable format with currency symbol
 * Examples: $1.2M, $450K, $1.5B, $500
 */
export function formatMarketCap(
  marketCap: string | number | undefined | null
): string {
  if (!marketCap) return "—"

  const num = typeof marketCap === "string" ? parseFloat(marketCap) : marketCap

  if (isNaN(num) || num === 0) return "—"

  // Use Intl.NumberFormat for currency formatting
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })

  if (num >= 1_000_000_000) {
    // Billions
    return formatter.format(num / 1_000_000_000) + "B"
  } else if (num >= 1_000_000) {
    // Millions
    return formatter.format(num / 1_000_000) + "M"
  } else if (num >= 1_000) {
    // Thousands
    return formatter.format(num / 1_000) + "K"
  } else {
    // Less than 1K
    return formatter.format(num)
  }
}

/**
 * Format market cap to full currency string for tooltips
 */
export function formatMarketCapFull(
  marketCap: string | number | undefined | null
): string {
  if (!marketCap) return "—"

  const num = typeof marketCap === "string" ? parseFloat(marketCap) : marketCap

  if (isNaN(num) || num === 0) return "—"

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num)
}

/**
 * Copy text to clipboard with fallback for older browsers
 * @param text - Text to copy to clipboard
 * @returns Promise that resolves to true if successful, false otherwise
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false

  // Try modern Clipboard API first
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch (err) {
      console.warn("Clipboard API failed, trying fallback:", err)
    }
  }

  // Fallback for older browsers
  try {
    const textArea = document.createElement("textarea")
    textArea.value = text
    textArea.style.position = "fixed"
    textArea.style.left = "-999999px"
    textArea.style.top = "-999999px"
    document.body.appendChild(textArea)
    textArea.focus()
    textArea.select()

    const successful = document.execCommand("copy")
    document.body.removeChild(textArea)

    return successful
  } catch (err) {
    console.error("Fallback copy method failed:", err)
    return false
  }
}
