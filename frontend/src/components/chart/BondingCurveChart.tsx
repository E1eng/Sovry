"use client";

import { useEffect, useRef } from "react";
import * as LightweightCharts from "lightweight-charts";

interface BondingCurvePoint {
  time: number; // Unix timestamp (seconds) or business-day index
  value: number;
}

interface BondingCurveChartProps {
  data: BondingCurvePoint[];
}

/**
 * Lightweight bonding curve chart for pump.fun-style UX.
 * - Dark transparent background
 * - Green area series
 * - No grid lines
 * - Auto-resizes with parent width
 */
const BondingCurveChart = ({ data }: BondingCurveChartProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);

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
      },
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

    if (typeof anyChart.addAreaSeries !== "function") {
      console.error("BondingCurveChart: addAreaSeries is not available on chart instance", anyChart);
      chartRef.current = anyChart;
      return;
    }

    const areaSeries = anyChart.addAreaSeries({
      lineColor: "#22c55e", // green-500
      topColor: "rgba(34, 197, 94, 0.35)",
      bottomColor: "rgba(34, 197, 94, 0.0)",
      lineWidth: 2,
    });

    chartRef.current = anyChart;
    seriesRef.current = areaSeries;

    // Initial resize to container size
    const resize = () => {
      if (!containerRef.current || !chartRef.current) return;
      const { width, height } = containerRef.current.getBoundingClientRect();
      const safeWidth = Math.max(Math.floor(width), 0);
      const safeHeight = Math.max(Math.floor(height || 200), 100);
      chartRef.current.resize(safeWidth, safeHeight);
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
      seriesRef.current = null;
    };
  }, []);

  // Update data when props change
  useEffect(() => {
    if (!seriesRef.current) return;

    const mapped = data.map((point) => ({
      time: point.time as any, // let lightweight-charts handle the numeric time
      value: point.value,
    }));

    seriesRef.current.setData(mapped);

    // Optionally auto-fit time scale to data
    if (chartRef.current && mapped.length > 0) {
      chartRef.current.timeScale().fitContent();
    }
  }, [data]);

  return (
    <div
      ref={containerRef}
      className="w-full h-48 sm:h-56 md:h-64 rounded-xl overflow-hidden"
      style={{ backgroundColor: "transparent" }}
    />
  );
};

export default BondingCurveChart;
