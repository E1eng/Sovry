"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const CATEGORIES = [
  "All",
  "Meme",
  "AI Agent",
  "Gaming",
  "Music",
  "Art",
] as const;

type Category = (typeof CATEGORIES)[number];

interface CategoryPillsProps {
  selectedCategory: Category;
  onCategoryChange: (category: Category) => void;
}

export function CategoryPills({ selectedCategory, onCategoryChange }: CategoryPillsProps) {
  return (
    <div className="flex flex-wrap gap-2 px-4 sm:px-6 lg:px-8 py-4">
      {CATEGORIES.map((category) => {
        const isActive = selectedCategory === category;
        return (
          <Badge
            key={category}
            variant="outline"
            onClick={() => onCategoryChange(category)}
            className={cn(
              "cursor-pointer px-4 py-1.5 text-sm font-medium transition-all duration-200",
              isActive
                ? "bg-sovry-green/20 text-sovry-green border-sovry-green/50 shadow-[0_0_12px_rgba(57,255,20,0.3)]"
                : "bg-zinc-900/50 text-zinc-400 border-zinc-800 hover:border-zinc-700 hover:text-zinc-50"
            )}
          >
            {category}
          </Badge>
        );
      })}
    </div>
  );
}

