import { cva, type VariantProps } from "class-variance-authority";

/**
 * Standalone copy of the brand button styling — only the variants/sizes the
 * landing uses. Applied to `<a>`/`<Link>` via `cn(buttonVariants(...))` so no
 * Radix Slot dependency is needed for a static marketing page.
 */
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-all shrink-0 outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary-hover",
        outline:
          "border border-border-strong bg-card text-foreground hover:border-faint",
        ghost:
          "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
      },
      size: {
        default: "h-9 px-4 py-2",
        lg: "h-10 rounded-md px-6",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export type ButtonVariantProps = VariantProps<typeof buttonVariants>;
