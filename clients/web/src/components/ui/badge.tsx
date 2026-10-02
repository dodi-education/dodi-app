import * as React from "react"
import { type VariantProps } from "class-variance-authority"
import { badge, type BadgeVariant } from "@dodi/ui-recipes"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

/** Classes from @dodi/ui-recipes (shared with the mobile app): box + text + web-only states. */
function badgeVariants({ variant }: { variant?: BadgeVariant | null } = {}) {
  const props = { variant }
  return cn(badge.box(props), badge.text(props), badge.web(props))
}

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
