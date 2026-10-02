"use client"

import * as React from "react"
import { Switch as SwitchPrimitive } from "radix-ui"

import { switchControl } from "@dodi/ui-recipes"

import { cn } from "@/lib/utils"

function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(switchControl.track, switchControl.web, className)}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(switchControl.thumb, switchControl.webThumb)}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
