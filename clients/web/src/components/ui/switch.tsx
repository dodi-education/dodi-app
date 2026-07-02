"use client"

import * as React from "react"
import { Switch as SwitchPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer inline-flex h-5 w-9 shrink-0 items-center rounded-full border-0 outline-none transition-colors data-[state=checked]:bg-primary data-[state=unchecked]:bg-border-strong focus-visible:ring-2 focus-visible:ring-primary-soft-2 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-4 translate-x-0.5 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.18)] transition-transform data-[state=checked]:translate-x-[18px]"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
