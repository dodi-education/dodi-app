import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, type PressableProps } from "react-native";
import { COLORS, type ColorToken } from "@dodi/design-tokens";
import { button, buttonIconColor, type ButtonSize, type ButtonVariant } from "@dodi/ui-recipes";

import { cn } from "@/lib/cn";

import { Icon, type IconName } from "./icon";
import { Text } from "./text";

export interface ButtonProps extends Omit<PressableProps, "children"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Leading icon (web: an <Icon> child, size-4 = 16). */
  icon?: IconName;
  /** Overrides the variant's icon color (web: a text-* class on the button, e.g. ghost + text-danger). */
  iconColor?: ColorToken;
  isLoading?: boolean;
  className?: string;
  textClassName?: string;
  children?: ReactNode;
}

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
      className={cn(button.box(p), icon && size === "default" && "px-3", isDisabled && "opacity-50", "active:opacity-80", className)}
      {...props}
    >
      {isLoading ? (
        <ActivityIndicator size="small" color={COLORS[iconColor]} />
      ) : icon ? (
        <Icon name={icon} size={size === "xs" || size === "icon-xs" ? 12 : 16} color={iconColor} />
      ) : null}
      {typeof children === "string" || typeof children === "number" ? (
        <Text className={cn(button.text(p), textClassName)} numberOfLines={1}>
          {children}
        </Text>
      ) : (
        children
      )}
    </Pressable>
  );
}
