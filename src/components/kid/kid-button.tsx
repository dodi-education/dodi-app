import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

const kidButtonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-extrabold transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary-soft-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        /** Hero filled pill (Play, New game). */
        play: "bg-primary text-white shadow-[0_3px_10px_rgba(47,107,216,0.28)] duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:bg-primary-hover hover:-translate-y-px active:scale-95",
        /** Quiet text pill (Remix, secondary actions). */
        ghost: "bg-transparent text-muted-foreground hover:bg-muted hover:text-ink",
        /** Round icon button; turns red on hover (Delete). */
        icon: "size-[38px] bg-transparent p-0 text-faint hover:bg-danger-soft hover:text-danger",
        /** Filter chip. */
        chip: "bg-white/65 text-muted-foreground hover:bg-white data-[active=true]:bg-ink data-[active=true]:text-white",
        /** Back pill on white/70. */
        back: "bg-white/70 text-muted-foreground hover:bg-white hover:text-ink",
      },
      size: {
        default: "px-6 py-2.5 text-[14.5px] [&_svg:not([class*='size-'])]:size-4",
        sm: "px-4 py-2 text-[13.5px] [&_svg:not([class*='size-'])]:size-3.5",
        lg: "px-7 py-3 text-[15px] [&_svg:not([class*='size-'])]:size-[17px]",
        none: "",
      },
    },
    defaultVariants: {
      variant: "play",
      size: "default",
    },
  },
);

interface KidButtonProps
  extends React.ComponentProps<"button">,
    VariantProps<typeof kidButtonVariants> {
  asChild?: boolean;
  active?: boolean;
}

function KidButton({
  className,
  variant,
  size,
  asChild = false,
  active,
  ...props
}: KidButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-active={active}
      className={cn(kidButtonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { KidButton, kidButtonVariants };
