"use client"

import { useEffect, useRef, useState } from "react"
import { createChart, ColorType, LineStyle, CandlestickSeries } from "lightweight-charts"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, AlertCircle, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import { useTradeHistory, type Timeframe } from "@/hooks/useTradeHistory"
import { fetchTrades } from "@/services/chartDataService"
import { trackEvent } from "@/lib/analytics"
import { memo } from "react"

export interface TradingChartProps {
  tokenAddress: string | null
  height?: number
  className?: string
  currentPrice?: string | null
  marketCap?: string | null
  reserveBalance?: string | null
}

const TIMEFRAMES: Timeframe[] = ["1M", "5M", "15M", "1H", "1D", "7D", "ALL"]

const TIMEFRAME_LABELS: Record<Timeframe, string> = {
  "1M": "1m",
  "5M": "5m",
  "15M": "15m",
  "1H": "1h",
  "1D": "1d",
  "7D": "7d",
  "ALL": "ALL",
}

function TradingChartComponent({
  tokenAddress,
  height = 400,
  className,
  currentPrice,
  marketCap,
  reserveBalance,
}: TradingChartProps) {
  const [timeframe, setTimeframe] = useState<Timeframe>("7D")
  const { data, isLoading, error, refetch } = useTradeHistory(tokenAddress, timeframe)
  
  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null)
  const candlestickSeriesRef = useRef<any | null>(null)
  const lastPriceLineRef = useRef<any | null>(null)
  const [chartInitialized, setChartInitialized] = useState(false)
  const [dailyHigh, setDailyHigh] = useState<number | null>(null)
  const [dailyLow, setDailyLow] = useState<number | null>(null)

  // Fetch 24h high/low from subgraph trades (independent of chart timeframe)
  useEffect(() => {
    if (!tokenAddress) {
      setDailyHigh(null)
      setDailyLow(null)
      return
    }

    let cancelled = false

    const loadDailyStats = async () => {
      try {
        const trades = await fetchTrades(tokenAddress, "24H")
        if (cancelled) return
        if (!trades || trades.length === 0) {
          setDailyHigh(null)
          setDailyLow(null)
          return
        }

        let high = trades[0].price
        let low = trades[0].price
        for (let i = 1; i < trades.length; i++) {
          const p = trades[i].price
          if (p > high) high = p
          if (p < low) low = p
        }
        setDailyHigh(high)
        setDailyLow(low)
      } catch (e) {
        if (!cancelled) {
          setDailyHigh(null)
          setDailyLow(null)
        }
      }
    }

    loadDailyStats()

    return () => {
      cancelled = true
    }
  }, [tokenAddress])

  const formatPrice = (value?: number | string | null): string => {
    if (value === undefined || value === null) return "—"
    const num = typeof value === "string" ? parseFloat(value) : value
    if (!isFinite(num)) return "—"

    const abs = Math.abs(num)
    if (abs === 0) return "0.00000000"

    // For prices >= 1 IP, 6 decimals is enough
    if (abs >= 1) return num.toFixed(6)

    // For tiny prices, always show 8 decimals, no scientific notation
    return num.toFixed(8)
  }

  const formatMarketCap = (value?: string | null): string => {
    const num = value ? parseFloat(value) : 0
    if (!isFinite(num) || num < 0) return "0.00 IP"

    if (num === 0) return "0.00 IP"

    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M IP`
    if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K IP`
    return `${num.toFixed(2)} IP`
  }

  // Initialize chart
  useEffect(() => {
    if (!containerRef.current || !tokenAddress) return

    const container = containerRef.current

    // Create chart with dark theme
    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#e5e7eb", // zinc-200
      },
      grid: {
        vertLines: {
          visible: true,
          color: "rgba(255, 255, 255, 0.1)",
          style: LineStyle.Solid,
        },
        horzLines: {
          visible: true,
          color: "rgba(255, 255, 255, 0.1)",
          style: LineStyle.Solid,
        },
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: {
          top: 0.1,
          bottom: 0.1,
        },
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
      },
      width: container.clientWidth,
      height: height,
    })

    // Create candlestick series with green/red colors (v5 API)
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e", // green-500
      downColor: "#ef4444", // red-500
      borderVisible: false,
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
      // Show more precision for tiny IP-denominated prices
      priceFormat: {
        type: "price",
        precision: 8,
        minMove: 0.00000001,
      },
    })

    chartRef.current = chart
    candlestickSeriesRef.current = candlestickSeries
    setChartInitialized(true)

    // Initial resize to container size
    const resize = () => {
      if (!container || !chart) return
      const { width } = container.getBoundingClientRect()
      const safeWidth = Math.max(Math.floor(width), 0)
      chart.resize(safeWidth, height)
    }

    resize()

    // Observe size changes for better responsiveness
    const resizeObserver = new ResizeObserver(() => {
      resize()
    })
    resizeObserver.observe(container)

    // Cleanup
    return () => {
      resizeObserver.disconnect()
      if (chart) {
        chart.remove()
      }
      chartRef.current = null
      candlestickSeriesRef.current = null
      lastPriceLineRef.current = null
      setChartInitialized(false)
    }
  }, [height, tokenAddress])

  // Update chart data when trade data changes
  useEffect(() => {
    if (!candlestickSeriesRef.current || !chartInitialized || !data || data.length === 0) {
      return
    }

    // Convert data to format expected by lightweight-charts
    const chartData = data.map((candle) => ({
      time: candle.time as any,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    }))

    candlestickSeriesRef.current.setData(chartData)

    // Add last price indicator line
    if (data.length > 0) {
      const lastCandle = data[data.length - 1]
      const lastPrice = lastCandle.close

      // Remove existing price line if any
      if (lastPriceLineRef.current) {
        try {
          candlestickSeriesRef.current.removePriceLine(lastPriceLineRef.current)
        } catch (e) {
          // Price line might not exist, ignore error
        }
        lastPriceLineRef.current = null
      }

      // Create new price line
      try {
        const priceLine = candlestickSeriesRef.current.createPriceLine({
          price: lastPrice,
          color: "#3b82f6", // blue-500
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: "Last Price",
        })

        lastPriceLineRef.current = priceLine
      } catch (e) {
        console.warn("Failed to create price line:", e)
      }
    }

    // Fit content to show all data
    if (chartRef.current) {
      chartRef.current.timeScale().fitContent()
    }
  }, [data, chartInitialized])

  if (!tokenAddress) {
    return (
      <div className={cn("relative w-full", className)}>
        <div className="flex items-center justify-center h-[400px] bg-zinc-900/50 rounded-lg border border-zinc-800">
          <p className="text-sm text-zinc-400">No token address provided</p>
        </div>
      </div>
    )
  }

  return (
    <div className={cn("relative w-full space-y-3", className)}>
      {/* Price / Market Cap / 24h High-Low */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-zinc-500">Price</div>
          <div className="text-base sm:text-lg font-semibold text-zinc-50">
            {formatPrice(currentPrice ?? (data.length > 0 ? data[data.length - 1].close : undefined))}
          </div>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-zinc-500">Market Cap</div>
          <div className="text-base sm:text-lg font-semibold text-zinc-50">
            {formatMarketCap(marketCap)}
          </div>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-zinc-500">24h High</div>
          <div className="text-base sm:text-lg font-semibold text-emerald-400">
            {formatPrice(dailyHigh)}
          </div>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-zinc-500">Reserve Balance</div>
          <div className="text-base sm:text-lg font-semibold text-zinc-50">
            {formatMarketCap(reserveBalance)}
          </div>
        </div>
      </div>

      {/* Timeframe Selector */}
      <div className="flex gap-2 justify-end items-center">
        {TIMEFRAMES.map((tf) => (
          <Button
            key={tf}
            variant={timeframe === tf ? "default" : "outline"}
            size="sm"
            onClick={() => setTimeframe(tf)}
            className="h-8 sm:h-7 text-xs px-3 touch-manipulation min-h-[32px]"
            disabled={isLoading}
          >
            {TIMEFRAME_LABELS[tf]}
          </Button>
        ))}
      </div>

      {/* Chart Container */}
      <div className="relative overflow-x-auto">
        {/* Loading State */}
        {isLoading && !chartInitialized && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/50 rounded-lg z-10">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-sovry-green" />
              <p className="text-xs text-zinc-400">Loading chart data...</p>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/50 rounded-lg z-10">
            <Alert variant="destructive" className="max-w-md">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="flex items-center gap-2">
                <span>Failed to load trade data: {error instanceof Error ? error.message : "Unknown error"}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetch()}
                  className="h-6 px-2 text-xs touch-manipulation"
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Retry
                </Button>
              </AlertDescription>
            </Alert>
          </div>
        )}

        {/* Chart */}
        <div
          ref={containerRef}
          className="w-full min-w-[600px]"
          style={{ height: `${height}px` }}
        />

        {/* Loading overlay for data refresh */}
        {isLoading && chartInitialized && (
          <div className="absolute top-2 right-2 z-10">
            <div className="flex items-center gap-2 px-2 py-1 bg-zinc-900/90 backdrop-blur-sm rounded border border-zinc-800">
              <Loader2 className="h-3 w-3 animate-spin text-sovry-green" />
              <span className="text-xs text-zinc-400">Refreshing...</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Memoize component to prevent unnecessary re-renders
export const TradingChart = memo(TradingChartComponent, (prevProps, nextProps) => {
  return (
    prevProps.tokenAddress === nextProps.tokenAddress &&
    prevProps.height === nextProps.height &&
    prevProps.currentPrice === nextProps.currentPrice &&
    prevProps.marketCap === nextProps.marketCap &&
    prevProps.reserveBalance === nextProps.reserveBalance &&
    prevProps.className === nextProps.className
  )
})

TradingChart.displayName = "TradingChart"
