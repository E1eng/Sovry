import { formatEther } from "viem";

const SUBGRAPH_URL =
  process.env.NEXT_PUBLIC_SUBGRAPH_URL ||
  "https://api.goldsky.com/api/public/project_cmhxop6ixrx0301qpd4oi5bb4/subgraphs/sovry-aeneid/1.1.1/gn";

export interface TradeData {
  timestamp: number;
  price: number;
  volume: number;
  amountIP: bigint;
  amountTokens: bigint;
  isBuy: boolean;
  trader: string;
  txHash: string;
}

export interface ChartDataPoint {
  time: number;
  value: number;
  volume?: number;
}

export interface OHLCData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type TimeRange = "1H" | "24H" | "7D" | "30D" | "ALL";

const TIME_RANGE_SECONDS: Record<TimeRange, number> = {
  "1H": 60 * 60,
  "24H": 24 * 60 * 60,
  "7D": 7 * 24 * 60 * 60,
  "30D": 30 * 24 * 60 * 60,
  "ALL": 0,
};

/**
 * Fetch trades from subgraph for a given token address
 */
export async function fetchTrades(
  tokenAddress: string,
  timeRange: TimeRange = "7D"
): Promise<TradeData[]> {
  try {
    const now = Math.floor(Date.now() / 1000);
    const from = timeRange === "ALL" ? 0 : now - TIME_RANGE_SECONDS[timeRange];

    const query = `
      query TradesForToken($token: Bytes!, $from: BigInt!) {
        trades(
          where: { token: $token, timestamp_gte: $from }
          orderBy: timestamp
          orderDirection: asc
        ) {
          id
          timestamp
          amountIP
          amountTokens
          isBuy
          trader
          txHash
        }
      }
    `;

    const response = await fetch(SUBGRAPH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        variables: {
          token: tokenAddress.toLowerCase(),
          from: from.toString(),
        },
      }),
    });

    if (!response.ok) {
      throw new Error("Subgraph request failed");
    }

    const json = await response.json();
        const trades = (json?.data?.trades || []) as Array<{
          timestamp: string;
          amountIP: string;
          amountTokens: string;
          isBuy: boolean;
          trader: string;
          txHash: string;
        }>;

        return trades.map((t) => {
          const timestamp = Number(t.timestamp || 0);
          const amountIP = BigInt(t.amountIP || "0");
          const amountTokens = BigInt(t.amountTokens || "0");

          // Calculate price: IP per token (both in 18 decimals)
          const price =
            amountTokens > 0n
              ? Number(formatEther(amountIP)) / Number(formatEther(amountTokens))
              : 0;

          // Volume in IP
          const volume = Number(formatEther(amountIP));

          return {
            timestamp,
            price,
            volume,
            amountIP,
            amountTokens,
            isBuy: t.isBuy,
            trader: t.trader || "",
            txHash: t.txHash || "",
          };
        });
  } catch (error) {
    console.error("Error fetching trades:", error);
    return [];
  }
}

/**
 * Convert trades to price chart data points
 */
export function tradesToPriceData(trades: TradeData[]): ChartDataPoint[] {
  if (trades.length === 0) return [];

  return trades.map((trade) => ({
    time: trade.timestamp,
    value: trade.price,
  }));
}

/**
 * Convert trades to volume chart data points
 */
export function tradesToVolumeData(trades: TradeData[]): ChartDataPoint[] {
  if (trades.length === 0) return [];

  // Aggregate volume by time bucket (e.g., hourly)
  const volumeMap = new Map<number, number>();

  trades.forEach((trade) => {
    // Round to nearest hour for aggregation
    const hour = Math.floor(trade.timestamp / 3600) * 3600;
    const current = volumeMap.get(hour) || 0;
    volumeMap.set(hour, current + trade.volume);
  });

  return Array.from(volumeMap.entries())
    .map(([time, volume]) => ({
      time,
      value: volume,
      volume,
    }))
    .sort((a, b) => a.time - b.time);
}

/**
 * Convert trades to OHLC (candlestick) data
 */
export function tradesToOHLCData(trades: TradeData[], intervalMinutes: number = 60): OHLCData[] {
  if (trades.length === 0) return [];

  const intervalSeconds = intervalMinutes * 60;
  const ohlcMap = new Map<number, { open: number; high: number; low: number; close: number; volume: number }>();

  trades.forEach((trade) => {
    const bucket = Math.floor(trade.timestamp / intervalSeconds) * intervalSeconds;
    const existing = ohlcMap.get(bucket);

    if (!existing) {
      ohlcMap.set(bucket, {
        open: trade.price,
        high: trade.price,
        low: trade.price,
        close: trade.price,
        volume: trade.volume,
      });
    } else {
      existing.high = Math.max(existing.high, trade.price);
      existing.low = Math.min(existing.low, trade.price);
      existing.close = trade.price;
      existing.volume += trade.volume;
    }
  });

  return Array.from(ohlcMap.entries())
    .map(([time, data]) => ({
      time,
      ...data,
    }))
    .sort((a, b) => a.time - b.time);
}

/**
 * Get combined price and volume data for dual chart display
 */
export async function getChartData(
  tokenAddress: string,
  timeRange: TimeRange = "7D"
): Promise<{
  priceData: ChartDataPoint[];
  volumeData: ChartDataPoint[];
  trades: TradeData[];
}> {
  const trades = await fetchTrades(tokenAddress, timeRange);
  const priceData = tradesToPriceData(trades);
  const volumeData = tradesToVolumeData(trades);

  return {
    priceData,
    volumeData,
    trades,
  };
}

