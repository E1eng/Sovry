"use client";

import CommentSection from "@/components/social/CommentSection";

interface PoolCommentsProps {
  tokenAddress: string;
}

// Simple local-only comment card for a pool. This is intentionally
// isolated so it can be wired to a real database later without
// touching the Recent Activity UI.
export function PoolComments({ tokenAddress }: PoolCommentsProps) {
  return <CommentSection tokenAddress={tokenAddress} />;
}
