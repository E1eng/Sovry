// Minimal error utilities used by SwapInterface and other components.

import { logger } from "@/lib/logger";

export interface ParsedTransactionError {
  message: string;
  userFriendlyMessage: string;
  suggestion?: string;
}

function getErrorMessage(error: unknown): string {
  if (!error) return "Unknown error";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function parseTransactionError(error: unknown): ParsedTransactionError {
  const raw = getErrorMessage(error);
  const lower = raw.toLowerCase();

  // Explicit handling for user-rejected transactions so we don't show a huge
  // wallet error payload in the UI. Keep the message short and skip details.
  if (
    lower.includes("user rejected") ||
    lower.includes("rejected the request") ||
    lower.includes("user denied") ||
    lower.includes("user canceled") ||
    lower.includes("user cancelled")
  ) {
    return {
      // Keep message empty so call sites that append "details" don't
      // duplicate or expand the toast with raw error content.
      message: "",
      userFriendlyMessage: "Transaction rejected by user.",
      suggestion: undefined,
    };
  }

  if (lower.includes("slippage") || lower.includes("insufficient output") || lower.includes("minout")) {
    return {
      message: raw,
      userFriendlyMessage: "Trade failed due to slippage.",
      suggestion: "Try increasing your slippage tolerance or reducing trade size.",
    };
  }

  if (lower.includes("insufficient funds") || lower.includes("insufficient balance")) {
    return {
      message: raw,
      userFriendlyMessage: "Insufficient balance for this trade.",
      suggestion: "Reduce the amount or top up your wallet.",
    };
  }

  return {
    message: raw,
    userFriendlyMessage: "Transaction failed.",
    suggestion: undefined,
  };
}

export function isSlippageError(error: unknown): boolean {
  const msg = getErrorMessage(error).toLowerCase();
  return msg.includes("slippage") || msg.includes("insufficient output") || msg.includes("minout");
}

export function isBalanceError(error: unknown): boolean {
  const msg = getErrorMessage(error).toLowerCase();
  return msg.includes("insufficient funds") || msg.includes("insufficient balance");
}

// Heuristic checks for network-level failures (fetch/RPC connectivity etc.)
export function isNetworkError(error: unknown): boolean {
  const msg = getErrorMessage(error).toLowerCase();
  return (
    msg.includes("network error") ||
    msg.includes("failed to fetch") ||
    msg.includes("network changed") ||
    msg.includes("timeout") ||
    msg.includes("econnreset") ||
    msg.includes("ecconnrefused")
  );
}

// Heuristic checks for RPC / blockchain node issues
export function isRPCError(error: unknown): boolean {
  const msg = getErrorMessage(error).toLowerCase();
  return (
    msg.includes("rpc error") ||
    msg.includes("execution reverted") ||
    msg.includes("call exception") ||
    msg.includes("invalid json rpc") ||
    msg.includes("provider error")
  );
}

export function logError(error: unknown, context?: string): void {
  if (typeof window === "undefined") return;
  if (process.env.NODE_ENV === "production") return;

  logger.error("[error]", context || "", error);
}
