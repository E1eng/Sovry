import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider transition-colors focus:outline-none focus:ring-2 focus:ring-sovry-green focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-sovry-green text-black hover:bg-sovry-green/90",
        secondary:
          "border-transparent bg-zinc-800 text-zinc-50 hover:bg-zinc-700",
        destructive:
          "border-transparent bg-sovry-pink text-white hover:bg-sovry-pink/90",
        outline: "border-zinc-700 text-zinc-50",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
