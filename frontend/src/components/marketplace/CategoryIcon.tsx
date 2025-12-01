"use client";

import { Trademark, Heart, User, Palette } from "lucide-react";
import { cn } from "@/lib/utils";

interface CategoryIconProps {
  category: string;
  className?: string;
  size?: number;
}

export function CategoryIcon({ category, className, size = 16 }: CategoryIconProps) {
  const categoryLower = category.toLowerCase();

  if (categoryLower.includes("brand") || categoryLower.includes("tm")) {
    return <Trademark className={cn("text-white", className)} size={size} />;
  }

  if (categoryLower.includes("pet") || categoryLower.includes("animal")) {
    // Using Heart as paw print alternative, or could use custom SVG
    return <Heart className={cn("text-white", className)} size={size} />;
  }

  if (categoryLower.includes("agent") || categoryLower.includes("ai")) {
    return <User className={cn("text-white", className)} size={size} />;
  }

  if (categoryLower.includes("art") || categoryLower.includes("creative")) {
    return <Palette className={cn("text-white", className)} size={size} />;
  }

  // Default icon
  return <Palette className={cn("text-white", className)} size={size} />;
}

