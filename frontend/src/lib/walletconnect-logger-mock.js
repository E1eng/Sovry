// Lightweight mock for @walletconnect/logger for browser/Next.js usage.
// Provides just enough surface area for @walletconnect/core and friends.

import { pino as basePino } from "./pino-mock";

export function pino(options = {}) {
  return basePino(options);
}

export function getDefaultLoggerOptions(options = {}) {
  const level = typeof options.level === "string" ? options.level : "error";
  return { level, ...options };
}

export function generateChildLogger(parentLogger, context) {
  const ctx = context || "walletconnect";

  if (parentLogger && typeof parentLogger.child === "function") {
    return parentLogger.child({ context: ctx });
  }

  return pino(getDefaultLoggerOptions({ name: ctx }));
}

export function getLoggerContext(logger) {
  if (!logger) return "walletconnect";
  return logger.context || logger.name || "walletconnect";
}

export function generatePlatformLogger(options = {}) {
  return pino(getDefaultLoggerOptions(options));
}
