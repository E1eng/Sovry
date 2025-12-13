"use client"

import Image from "next/image"
import { useEffect, useRef, useState } from "react"
import { createChart, ColorType, LineStyle, CandlestickSeries } from "lightweight-charts"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, AlertCircle, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import { useTradeHistory, type Timeframe } from "@/hooks/useTradeHistory"
import { useLiveTrades } from "@/hooks/useLiveTrades"
import { fetchTrades } from "@/services/chartDataService"
import { memo } from "react"

export interface TradingChartProps {
  tokenAddress: string | null
  height?: number
  className?: string
  currentPrice?: string | null
  marketCap?: string | null
  reserveBalance?: string | null
  onDailyChangePct?: (pct: number | null) => void
}

const TIMEFRAMES: Timeframe[] = ["1M", "5M", "15M", "1H", "1D", "3D", "7D"]

const TIMEFRAME_LABELS: Record<Timeframe, string> = {
  "1M": "1m",
  "5M": "5m",
  "15M": "15m",
  "1H": "1h",
  "1D": "1d",
  "3D": "3d",
  "7D": "7d",
}

function TradingChartComponent({
  tokenAddress,
  height = 400,
  className,
  currentPrice,
  marketCap,
  reserveBalance,
  onDailyChangePct,
}: TradingChartProps) {
  const timeframeStorageKey = tokenAddress
    ? `sovry-chart-timeframe-${tokenAddress.toLowerCase()}`
    : "sovry-chart-timeframe-global"

  const [timeframe, setTimeframe] = useState<Timeframe>(() => {
    if (typeof window !== "undefined") {
      const raw = window.localStorage.getItem(timeframeStorageKey) as Timeframe | null
      if (raw && (TIMEFRAMES as string[]).includes(raw)) {
        return raw
      }
    }
    return "7D"
  })
  const { data, isLoading, error, refetch } = useTradeHistory(tokenAddress, timeframe)
  const { candles: liveCandles } = useLiveTrades(tokenAddress, timeframe)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null)
  const candlestickSeriesRef = useRef<any | null>(null)
  const lastPriceLineRef = useRef<any | null>(null)
  const [chartInitialized, setChartInitialized] = useState(false)
  const [, setDailyHigh] = useState<number | null>(null)
  const [, setDailyLow] = useState<number | null>(null)
  const [dailyVolume, setDailyVolume] = useState<number | null>(null)
  const [, setDailyChangePct] = useState<number | null>(null)

  // Persist selected timeframe per token so it survives re-mounts (e.g. after trades)
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(timeframeStorageKey, timeframe)
    }
  }, [timeframe, timeframeStorageKey])

  // Fetch 24h high/low from subgraph trades (independent of chart timeframe)
  // Re-run when trade history or live candles change so 24h stats don't get stuck
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
          setDailyVolume(null)
          setDailyChangePct(null)
          if (onDailyChangePct) onDailyChangePct(null)
          return
        }

        let high = trades[0].price
        let low = trades[0].price
        let volume = trades[0].volume || 0
        for (let i = 1; i < trades.length; i++) {
          const p = trades[i].price
          const v = trades[i].volume || 0
          if (p > high) high = p
          if (p < low) low = p
          volume += v
        }

        // Compute 24h change from the TRUE 24h low to the latest price so we
        // show the maximum pump within the 24h window.
        let changePct: number | null = null
        if (trades.length > 0) {
          const lastPrice = trades[trades.length - 1].price
          if (low && low > 0) {
            changePct = ((lastPrice - low) / low) * 100
          }
        }

        setDailyHigh(high)
        setDailyLow(low)
        setDailyVolume(volume)
        setDailyChangePct(changePct)
        if (onDailyChangePct) onDailyChangePct(changePct)
      } catch {
        if (!cancelled) {
          setDailyHigh(null)
          setDailyLow(null)
          setDailyVolume(null)
          setDailyChangePct(null)
          if (onDailyChangePct) onDailyChangePct(null)
        }
      }
    }

    loadDailyStats()

    return () => {
      cancelled = true
    }
  }, [tokenAddress, onDailyChangePct, data, liveCandles])

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
    if (value === undefined || value === null) return "—"
    const num = parseFloat(value)
    if (!isFinite(num)) return "—"

    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M IP`
    if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K IP`
    if (num >= 1) return `${num.toFixed(2)} IP`
    if (num >= 0.01) return `${num.toFixed(4)} IP`
    return `${num.toFixed(6)} IP`
  }

  const parsedCurrentPrice =
    currentPrice && isFinite(Number(currentPrice)) ? Number(currentPrice) : null

  const lastCandlePrice =
    data && data.length > 0 ? data[data.length - 1].close : null

  const effectivePrice =
    parsedCurrentPrice !== null && isFinite(parsedCurrentPrice)
      ? parsedCurrentPrice
      : lastCandlePrice ?? null

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

  // Update chart data when trade data, live candles, or current price change
  useEffect(() => {
    if (!candlestickSeriesRef.current || !chartInitialized) {
      return
    }

    const baseCandles = data || []

    // Merge historical subgraph candles with live candles from RPC
    let mergedCandles = baseCandles
    if (liveCandles && liveCandles.length > 0) {
      if (baseCandles.length === 0) {
        mergedCandles = liveCandles
      } else {
        const lastHistoricalTime = baseCandles[baseCandles.length - 1].time
        const appended = liveCandles.filter((candle) => candle.time > lastHistoricalTime)
        mergedCandles = [...baseCandles, ...appended]
      }
    }

    if (!mergedCandles || mergedCandles.length === 0) {
      return
    }

    // Convert data to format expected by lightweight-charts.
    // Use on-chain currentPrice as the close of the latest candle body when available,
    // but keep the Last Price line driven by the subgraph's last trade close.
    const chartData = mergedCandles.map((candle, index) => {
      let close = candle.close
      if (
        index === mergedCandles.length - 1 &&
        parsedCurrentPrice !== null &&
        isFinite(parsedCurrentPrice)
      ) {
        close = parsedCurrentPrice
      }

      const open = candle.open
      const high = Math.max(candle.high, open, close)
      const low = Math.min(candle.low, open, close)

      return {
        time: candle.time as any,
        open,
        high,
        low,
        close,
      }
    })

    candlestickSeriesRef.current.setData(chartData)

    // Add last price indicator line (subgraph last trade close)
    if (baseCandles.length > 0) {
      const rawLastCandle = baseCandles[baseCandles.length - 1]
      const lastPrice = rawLastCandle.close

      // Remove existing price line if any
      if (lastPriceLineRef.current) {
        try {
          candlestickSeriesRef.current.removePriceLine(lastPriceLineRef.current)
        } catch {
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
  }, [data, liveCandles, chartInitialized, parsedCurrentPrice])

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
          <div className="text-[11px] uppercase tracking-wide text-zinc-500">Price</div>
          <div className="flex items-baseline gap-2">
            <span className="text-base sm:text-lg font-semibold text-zinc-50">
              {formatPrice(effectivePrice)}
            </span>
            <span
              className={cn(
                "inline-flex items-center gap-1 text-sm sm:text-base font-medium text-zinc-400",
              )}
            >
              <Image
                src="/ip-token.svg"
                alt="IP"
                width={18}
                height={18}
              />
            </span>
          </div>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2">
          <div className="text-[11px] uppercase tracking-wide text-zinc-500">Market Cap</div>
          <div className="text-base sm:text-lg font-semibold text-zinc-50">
            {formatMarketCap(marketCap)}
          </div>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2">
          <div className="text-[11px] uppercase tracking-wide text-zinc-500">24h Volume</div>
          <div className="text-base sm:text-lg font-semibold text-emerald-400">
            {formatMarketCap(
              dailyVolume !== null && isFinite(dailyVolume)
                ? dailyVolume.toString()
                : "0"
            )}
          </div>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2">
          <div className="text-[11px] uppercase tracking-wide text-zinc-500">Reserve Balance</div>
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
