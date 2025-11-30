"use client"

import { useEffect, useRef, useState } from "react"
import * as LightweightCharts from "lightweight-charts"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, AlertCircle, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import { useTradeHistory, type Timeframe } from "@/hooks/useTradeHistory"
import { trackEvent } from "@/lib/analytics"
import { memo } from "react"

export interface TradingChartProps {
  tokenAddress: string | null
  height?: number
  className?: string
}

const TIMEFRAMES: Timeframe[] = ["1H", "24H", "7D", "ALL"]

function TradingChartComponent({
  tokenAddress,
  height = 400,
  className,
}: TradingChartProps) {
  const [timeframe, setTimeframe] = useState<Timeframe>("7D")
  const { data, isLoading, error, refetch } = useTradeHistory(tokenAddress, timeframe)
  
  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<ReturnType<typeof LightweightCharts.createChart> | null>(null)
  const candlestickSeriesRef = useRef<ReturnType<typeof LightweightCharts.IChartApi.createCandlestickSeries> | null>(null)
  const lastPriceLineRef = useRef<ReturnType<typeof LightweightCharts.IChartApi.createPriceLine> | null>(null)
  const [chartInitialized, setChartInitialized] = useState(false)
  
  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!tokenAddress) return
    
    const interval = setInterval(() => {
      refetch()
    }, 30000) // 30 seconds
    
    return () => clearInterval(interval)
  }, [tokenAddress, refetch])

  // Initialize chart
  useEffect(() => {
    if (!containerRef.current || !tokenAddress) return

    const container = containerRef.current

    // Create chart with dark theme
    const chart = LightweightCharts.createChart(container, {
      layout: {
        background: { type: LightweightCharts.ColorType.Solid, color: "transparent" },
        textColor: "#e5e7eb", // zinc-200
      },
      grid: {
        vertLines: {
          visible: true,
          color: "rgba(255, 255, 255, 0.1)",
          style: LightweightCharts.LineStyle.Solid,
        },
        horzLines: {
          visible: true,
          color: "rgba(255, 255, 255, 0.1)",
          style: LightweightCharts.LineStyle.Solid,
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

    // Create candlestick series with green/red colors
    const candlestickSeries = chart.addCandlestickSeries({
      upColor: "#22c55e", // green-500
      downColor: "#ef4444", // red-500
      borderVisible: false,
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
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
          lineStyle: LightweightCharts.LineStyle.Dashed,
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
      {/* Timeframe Selector */}
      <div className="flex gap-2 justify-end">
        {TIMEFRAMES.map((tf) => (
          <Button
            key={tf}
            variant={timeframe === tf ? "default" : "outline"}
            size="sm"
            onClick={() => setTimeframe(tf)}
            className="h-8 sm:h-7 text-xs px-3 touch-manipulation min-h-[32px]"
            disabled={isLoading}
          >
            {tf}
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
    prevProps.height === nextProps.height
  )
})

TradingChart.displayName = "TradingChart"

