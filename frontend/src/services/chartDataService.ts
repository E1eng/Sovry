import { formatEther } from "viem";
import { logger } from "@/lib/logger";
import { getSubgraphUrl } from "@/lib/env";

const SUBGRAPH_URL = getSubgraphUrl();

// Raw shape aligned with current Trade entity in the subgraph
interface RawTrade {
  timestamp: string;
  type: "BUY" | "SELL";
  amount: string;
  value: string;
  fee: string;
  txHash: string;
  user?: { id?: string | null } | null;
}

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

export interface OHLCData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type TimeRange = "1H" | "24H" | "7D" | "30D";

const TIME_RANGE_SECONDS: Record<TimeRange, number> = {
  "1H": 60 * 60,
  "24H": 24 * 60 * 60,
  "7D": 7 * 24 * 60 * 60,
  "30D": 30 * 24 * 60 * 60,
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
    const from = now - TIME_RANGE_SECONDS[timeRange];

    const query = `
      query TradesForToken($token: String!, $from: BigInt!) {
        trades(
          where: { wrapper: $token, timestamp_gte: $from }
          orderBy: timestamp
          orderDirection: asc
        ) {
          timestamp
          type
          amount
          value
          fee
          txHash
          user { id }
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
    const trades = (json?.data?.trades || []) as RawTrade[];

    return trades.map((t) => {
      const timestamp = Number(t.timestamp || 0);

      const amountRaw = BigInt(t.amount || "0");
      const valueRaw = BigInt(t.value || "0");
      const feeRaw = BigInt(t.fee || "0");

      const amountIP = valueRaw + feeRaw;
      const amountTokens = amountRaw;

      // amountTokens is 6-decimal wrapper units, amountIP is 18-decimal IP (wei)
      const ipFloat = Number(formatEther(amountIP));
      const tokenFloat = Number(amountTokens) / 1e6; // full wrapper tokens

      const price = tokenFloat > 0 ? ipFloat / tokenFloat : 0; // IP per wrapper token
      const volume = ipFloat;

      return {
        timestamp,
        price,
        volume,
        amountIP,
        amountTokens,
        isBuy: t.type === "BUY",
        trader: t.user?.id || "",
        txHash: t.txHash || "",
      };
    });
  } catch (error) {
    logger.error("Error fetching trades:", error);
    return [];
  }
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
