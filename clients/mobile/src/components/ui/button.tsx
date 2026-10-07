import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, type PressableProps } from "react-native";
import { COLORS, type ColorToken } from "@dodi/design-tokens";
import { button, buttonIconColor, type ButtonSize, type ButtonVariant } from "@dodi/ui-recipes";

import { cn } from "@/lib/cn";
import { BUTTON_HIT_SLOP } from "@/lib/control-targets";
import { MAX_FONT_SCALE } from "@/lib/font-scale";

import { Icon, type IconName } from "./icon";
import { Text } from "./text";

type IconButtonSize = Extract<ButtonSize, `icon${string}`>;

interface ButtonBaseProps extends Omit<PressableProps, "children"> {
  variant?: ButtonVariant;
  /** Leading icon (web: an <Icon> child, size-4 = 16). */
  icon?: IconName;
  /** Overrides the variant's icon color (web: a text-* class on the button, e.g. ghost + text-danger). */
  iconColor?: ColorToken;
  isLoading?: boolean;
  className?: string;
  textClassName?: string;
  children?: ReactNode;
}

/**
 * An icon-size button shows no text, so it must be named for screen readers
 * (CLAUDE.md: an accessibilityLabel on every icon-only control).
 */
export type ButtonProps = ButtonBaseProps &
  (
    | { size: IconButtonSize; accessibilityLabel: string }
    | { size?: Exclude<ButtonSize, IconButtonSize> }
  );

/** The web's Button: same variants, sizes and classes (@dodi/ui-recipes). */
export function Button({
  variant = "default",
  size = "default",
  icon,
  iconColor: iconColorOverride,
  isLoading = false,
  disabled,
  className,
  textClassName,
  children,
  ...props
}: ButtonProps) {
  const p = { variant, size };
  const isDisabled = Boolean(disabled || isLoading);
  const iconColor = iconColorOverride ?? buttonIconColor[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: isLoading }}
      disabled={isDisabled}
      // Every size is under 44pt (the web's h-9, size-8 …): the target grows, the look doesn't.
      hitSlop={BUTTON_HIT_SLOP[size]}
      className={cn(button.box(p), icon && size === "default" && "px-3", isDisabled && "opacity-50", "active:opacity-80", className)}
      {...props}
    >
      {isLoading ? (
        <ActivityIndicator size="small" color={COLORS[iconColor]} />
      ) : icon ? (
        <Icon name={icon} size={size === "xs" || size === "icon-xs" ? 12 : 16} color={iconColor} />
      ) : null}
      {typeof children === "string" || typeof children === "number" ? (
        <Text
          className={cn(button.text(p), textClassName)}
          numberOfLines={1}
          // The web's fixed heights (h-9 …): the label grows to 1.5×, not past the box.
          maxFontSizeMultiplier={MAX_FONT_SCALE.control}
        >
          {children}
        </Text>
      ) : (
        children
      )}
    </Pressable>
  );
}
