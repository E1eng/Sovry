import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sovry-green focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-sovry-green text-black font-bold uppercase tracking-wide hover:bg-sovry-green/90",
        destructive:
          "bg-sovry-pink text-white font-bold uppercase tracking-wide hover:bg-sovry-pink/90",
        buy: "bg-sovry-green text-black font-bold uppercase tracking-wide hover:bg-sovry-green/90",
        sell: "bg-sovry-pink text-white font-bold uppercase tracking-wide hover:bg-sovry-pink/90",
        outline:
          "border-2 border-zinc-700 text-zinc-50 font-semibold hover:bg-zinc-800",
        secondary:
          "bg-zinc-800 text-zinc-50 font-semibold hover:bg-zinc-700",
        ghost: "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-50",
        link: "text-sovry-green underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-6 py-3",
        sm: "h-9 rounded-lg px-4 py-2",
        lg: "h-11 rounded-lg px-8 py-3",
        icon: "h-10 w-10 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
