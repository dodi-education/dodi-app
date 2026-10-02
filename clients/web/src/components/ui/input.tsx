import * as React from "react"

import { input } from "@dodi/ui-recipes"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(input.box, input.text, input.web, className)}
      {...props}
    />
  )
}

export { Input }
