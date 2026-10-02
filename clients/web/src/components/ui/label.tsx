"use client"

import * as React from "react"
import { Label as LabelPrimitive } from "radix-ui"

import { label } from "@dodi/ui-recipes"

import { cn } from "@/lib/utils"

function Label({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(label.box, label.text, label.web, className)}
      {...props}
    />
  )
}

export { Label }
