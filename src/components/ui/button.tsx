import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Apple-style pills: filled blue for the one key action ("Buy", "Learn
// more"), a blue outline for the companion action, quiet grey for the rest.
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-normal transition-colors duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-[#0077ed] active:bg-[#006edb]",
        destructive: "bg-destructive text-white hover:bg-destructive/90",
        outline: "border border-primary text-primary hover:bg-primary hover:text-primary-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-[#dcdce1] dark:hover:bg-[#3a3a3c]",
        ghost: "text-foreground hover:bg-muted",
        link: "text-accent hover:underline underline-offset-4",
      },
      size: {
        default: "h-10 px-5",
        sm: "h-8 px-4 text-xs",
        lg: "h-12 px-7 text-[17px]",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";
