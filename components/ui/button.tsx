import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center font-medium rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 select-none relative",
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-primary-foreground hover:bg-primary-hover shadow-xs active:opacity-95",
        secondary:
          "border border-border bg-surface text-foreground hover:bg-surface-muted active:bg-surface-muted/80",
        outline:
          "border border-border bg-surface text-foreground hover:bg-surface-muted active:bg-surface-muted/80",
        ghost:
          "text-foreground hover:bg-surface-muted active:bg-surface-muted/80",
        destructive:
          "bg-danger text-white hover:bg-danger/90 shadow-xs active:opacity-95",
      },
      size: {
        default: "min-h-[40px] sm:min-h-[40px] min-h-[44px] px-4 py-2 text-sm",
        sm: "min-h-[36px] px-3 py-1.5 text-xs",
        lg: "min-h-[44px] px-6 py-2.5 text-base",
        icon: "w-10 h-10 min-h-[40px] p-0 flex items-center justify-center",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, isLoading, children, disabled, ...props },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      >
        {isLoading && (
          <span className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-4 h-4 animate-spin text-current" />
          </span>
        )}
        <span
          className={cn(
            "inline-flex items-center gap-2",
            isLoading && "invisible"
          )}
        >
          {children}
        </span>
      </button>
    );
  }
);

Button.displayName = "Button";
