// Lightweight analytics helper for frontend components
// This avoids hard dependency on any external analytics SDK.

export type AnalyticsEventProps = Record<string, unknown> | undefined;

/**
 * Track a UI event. In production you can wire this to your real
 * analytics provider (PostHog, Plausible, etc.). For now we just
 * do a guarded console.log so it is effectively free.
 */
export function trackEvent(eventName: string, props?: AnalyticsEventProps): void {
  if (typeof window === "undefined") {
    // Never run on the server
    return;
  }

  // TODO: Integrate with real analytics SDK here if desired
  if (process.env.NODE_ENV !== "production") {
    // Dev logging only to avoid noisy production console
    // eslint-disable-next-line no-console
    console.debug("[analytics]", eventName, props || {});
  }
}

export function trackTrade(
  type: "buy" | "sell",
  tokenAddress: string | undefined,
  amount: string,
  success: boolean,
  error?: string,
): void {
  trackEvent("trade", {
    type,
    tokenAddress,
    amount,
    success,
    error,
  });
}

export function trackApproval(
  tokenAddress: string | undefined,
  success: boolean,
  error?: string,
): void {
  trackEvent("approval", {
    tokenAddress,
    success,
    error,
  });
}
