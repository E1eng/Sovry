"use client";

import { cn } from "@/lib/utils";

interface ScoreBadgeProps {
  score: number;
  className?: string;
}

export function ScoreBadge({ score, className }: ScoreBadgeProps) {
  return (
    <div
      className={cn(
        "px-4 py-2 rounded-lg bg-gradient-to-r from-red-500 via-pink-500 to-pink-600",
        "text-white font-bold text-3xl shadow-lg",
        className
      )}
    >
      {score}
    </div>
  );
}

