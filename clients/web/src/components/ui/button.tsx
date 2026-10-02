import * as React from "react"
import { type VariantProps } from "class-variance-authority"
import { button, type ButtonSize, type ButtonVariant } from "@dodi/ui-recipes"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

/** Classes from @dodi/ui-recipes (shared with the mobile app): box + text + web-only states. */
function buttonVariants({
  variant,
  size,
  className,
}: { variant?: ButtonVariant | null; size?: ButtonSize | null; className?: string } = {}) {
  const props = { variant, size }
  return cn(button.box(props), button.text(props), button.web(props), className)
}

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
