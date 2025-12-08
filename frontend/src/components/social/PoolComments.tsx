"use client";

import CommentSection from "@/components/social/CommentSection";

interface PoolCommentsProps {
  // Wrapper token address used as the thread key in Supabase
  tokenAddress: string;
  // Optional human-readable token name/ticker for UI labels
  tokenName?: string;
}

// Simple comment card for a pool, wired to Supabase-based threads.
export function PoolComments({ tokenAddress, tokenName }: PoolCommentsProps) {
  return <CommentSection tokenAddress={tokenAddress} tokenName={tokenName} />;
}
