"use client";

import { useEffect, useRef, useState } from "react";
import * as LightweightCharts from "lightweight-charts";
import { Button } from "@/components/ui/button";
import type { TimeRange } from "@/services/chartDataService";

interface ChartDataPoint {
  time: number;
  value: number;
  volume?: number;
}

interface BondingCurveChartProps {
  priceData: ChartDataPoint[];
  volumeData?: ChartDataPoint[];
  timeRange?: TimeRange;
  onTimeRangeChange?: (range: TimeRange) => void;
  height?: number;
}

const TIME_RANGES: TimeRange[] = ["1H", "24H", "7D", "30D", "ALL"];

/**
 * Enhanced bonding curve chart with dual display (price + volume).
 * - Price chart: Area series showing token price over time
 * - Volume chart: Histogram showing trading volume
 * - Time range selector
 * - Real-time updates
 */
const BondingCurveChart = ({
  priceData,
  volumeData = [],
  timeRange = "7D",
  onTimeRangeChange,
  height = 400,
}: BondingCurveChartProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<any>(null);
  const priceSeriesRef = useRef<any>(null);
  const volumeSeriesRef = useRef<any>(null);

  // Initialize chart once
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;

    const chart = LightweightCharts.createChart(container, {
      layout: {
        background: { type: LightweightCharts.ColorType.Solid, color: "transparent" },
        textColor: "#e5e7eb", // tailwind slate-200
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: {
          top: 0.1,
          bottom: volumeData.length > 0 ? 0.4 : 0.1,
        },
      },
      leftPriceScale: volumeData.length > 0
        ? {
            visible: true,
            borderVisible: false,
            scaleMargins: {
              top: 0.6,
              bottom: 0.1,
            },
          }
        : undefined,
      timeScale: {
        borderVisible: false,
        secondsVisible: true,
        timeVisible: true,
      },
      crosshair: {
        mode: LightweightCharts.CrosshairMode.Normal,
      },
      localization: {
        priceFormatter: (price: number) => price.toFixed(4),
      },
    });

    const anyChart: any = chart;

    // Add price series (area chart)
    if (typeof anyChart.addAreaSeries === "function") {
      const priceSeries = anyChart.addAreaSeries({
        lineColor: "#22c55e", // green-500
        topColor: "rgba(34, 197, 94, 0.35)",
        bottomColor: "rgba(34, 197, 94, 0.0)",
        lineWidth: 2,
        priceScaleId: "right",
      });
      priceSeriesRef.current = priceSeries;
    }

    // Add volume series (histogram) if volume data exists
    if (volumeData.length > 0 && typeof anyChart.addHistogramSeries === "function") {
      const volumeSeries = anyChart.addHistogramSeries({
        color: "#3b82f6", // blue-500
        priceFormat: {
          type: "volume",
        },
        priceScaleId: "left",
        scaleMargins: {
          top: 0.6,
          bottom: 0,
        },
      });
      volumeSeriesRef.current = volumeSeries;
    }

    chartRef.current = anyChart;

    // Initial resize to container size
    const resize = () => {
      if (!containerRef.current || !chartRef.current) return;
      const { width } = containerRef.current.getBoundingClientRect();
      const safeWidth = Math.max(Math.floor(width), 0);
      chartRef.current.resize(safeWidth, height);
    };

    resize();

    // Observe size changes
    const resizeObserver = new ResizeObserver(() => {
      resize();
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      priceSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, [height, volumeData.length]);

  // Update price data when props change
  useEffect(() => {
    if (!priceSeriesRef.current) return;

    const mapped = priceData.map((point) => ({
      time: point.time as any,
      value: point.value,
    }));

    priceSeriesRef.current.setData(mapped);

    // Auto-fit time scale to data
    if (chartRef.current && mapped.length > 0) {
      chartRef.current.timeScale().fitContent();
    }
  }, [priceData]);

  // Update volume data when props change
  useEffect(() => {
    if (!volumeSeriesRef.current || volumeData.length === 0) return;

    const mapped = volumeData.map((point) => ({
      time: point.time as any,
      value: point.volume || point.value,
      color: point.value > 0 ? "rgba(59, 130, 246, 0.5)" : "rgba(239, 68, 68, 0.5)",
    }));

    volumeSeriesRef.current.setData(mapped);
  }, [volumeData]);

  return (
    <div className="space-y-2">
      {/* Time Range Selector */}
      {onTimeRangeChange && (
        <div className="flex gap-2 justify-end">
          {TIME_RANGES.map((range) => (
            <Button
              key={range}
              variant={timeRange === range ? "default" : "outline"}
              size="sm"
              onClick={() => onTimeRangeChange(range)}
              className="h-7 text-xs px-2"
            >
              {range}
            </Button>
          ))}
        </div>
      )}

      {/* Chart Container */}
      <div
        ref={containerRef}
        className="w-full rounded-xl overflow-hidden"
        style={{ height: `${height}px`, backgroundColor: "transparent" }}
      />
    </div>
  );
};

export default BondingCurveChart;
