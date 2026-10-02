import * as React from "react";
import { Slot } from "radix-ui";
import {
  type KidButtonSize,
  type KidButtonVariant,
  kidButton,
} from "@dodi/ui-recipes";

import { cn } from "@/lib/utils";

/**
 * The kid view's pill buttons. Classes from @dodi/ui-recipes (shared with the
 * app's KidButton): box + text + the browser-only states.
 */
function kidButtonVariants({
  variant,
  size,
  className,
}: {
  variant?: KidButtonVariant | null;
  size?: KidButtonSize | null;
  className?: string;
} = {}): string {
  const v = { variant, size };
  return cn(kidButton.box(v), kidButton.text(v), kidButton.web(v), className);
}

interface KidButtonProps extends React.ComponentProps<"button"> {
  variant?: KidButtonVariant | null;
  size?: KidButtonSize | null;
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
      className={kidButtonVariants({ variant, size, className })}
      {...props}
    />
  );
}

export { KidButton, kidButtonVariants };
