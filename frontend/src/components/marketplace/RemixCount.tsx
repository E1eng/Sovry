"use client";

import { Copy, Layers } from "lucide-react";
import { cn } from "@/lib/utils";

interface RemixCountProps {
  count: number;
  className?: string;
}

export function RemixCount({ count, className }: RemixCountProps) {
  return (
    <div className={cn("flex items-center gap-1.5 text-white", className)}>
      <Layers className="h-4 w-4" />
      <span className="text-sm font-medium">{count}</span>
    </div>
  );
}

