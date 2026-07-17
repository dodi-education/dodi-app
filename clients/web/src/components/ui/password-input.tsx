"use client";

import * as React from "react";
import { useState } from "react";

import { Icon } from "@/components/shared/icon";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface PasswordInputProps
  extends Omit<React.ComponentProps<"input">, "type"> {
  /** Localized aria-label for the toggle while the password is hidden. */
  showPasswordLabel: string;
  /** Localized aria-label for the toggle while the password is visible. */
  hidePasswordLabel: string;
}

/**
 * Password field with a show/hide visibility toggle. The toggle is an
 * icon-only button, so callers must pass localized labels for it (same
 * convention as `PinInput`'s `ariaLabel`).
 */
function PasswordInput({
  className,
  showPasswordLabel,
  hidePasswordLabel,
  ...props
}: PasswordInputProps) {
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  return (
    <div className="relative">
      <Input
        type={isPasswordVisible ? "text" : "password"}
        className={cn("pr-10", className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setIsPasswordVisible((visible) => !visible)}
        className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground"
        aria-label={isPasswordVisible ? hidePasswordLabel : showPasswordLabel}
      >
        <Icon name={isPasswordVisible ? "hide" : "show"} className="h-4 w-4" />
      </button>
    </div>
  );
}

export { PasswordInput };
