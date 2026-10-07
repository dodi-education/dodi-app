import type { ReactNode } from "react";
import { Pressable, type PressableProps, type StyleProp, View, type ViewStyle } from "react-native";
import {
  type KidButtonSize,
  type KidButtonVariant,
  kidButton,
  kidButtonIconColor,
  kidButtonIconSize,
} from "@dodi/ui-recipes";

import { Icon, type IconName } from "@/components/ui";
import { cn } from "@/lib/cn";
import { kidButtonHitSlop } from "@/lib/control-targets";

import { kidShadowStyle } from "./kid-shadow";
import { KidText } from "./kid-text";

interface KidButtonBaseProps extends Omit<PressableProps, "children" | "style"> {
  style?: StyleProp<ViewStyle>;
  size?: KidButtonSize;
  /** Leading icon (web: an <Icon> child). */
  icon?: IconName;
  iconSize?: number;
  iconStroke?: number;
  /** A selected filter chip (web: data-active). */
  active?: boolean;
  className?: string;
  textClassName?: string;
  children?: ReactNode;
}

/** The icon variant shows no text, so it must be named for screen readers. */
export type KidButtonProps = KidButtonBaseProps &
  (
    | { variant: "icon"; accessibilityLabel: string }
    | { variant?: Exclude<KidButtonVariant, "icon"> }
  );

/** The web's KidButton: the kid view's pill buttons (@dodi/ui-recipes kidButton). */
export function KidButton({
  variant = "play",
  size = "default",
  icon,
  iconSize,
  iconStroke,
  active = false,
  disabled,
  className,
  textClassName,
  children,
  style,
  ...props
}: KidButtonProps) {
  const p = { variant, size };
  const isActive = variant === "chip" && active;
  const iconColor = isActive ? "primary-foreground" : kidButtonIconColor[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled), selected: variant === "chip" ? active : undefined }}
      disabled={disabled}
      // Kid targets: at least 44pt even for the small pills and the 38pt icon circle.
      hitSlop={kidButtonHitSlop(variant, size)}
      style={[variant === "play" && !disabled ? kidShadowStyle("play") : null, style]}
      className={cn(
        kidButton.box(p),
        isActive && kidButton.activeBox,
        disabled && "opacity-50",
        "active:opacity-80",
        className,
      )}
      {...props}
    >
      {icon ? <Icon name={icon} size={iconSize ?? kidButtonIconSize[size]} stroke={iconStroke} color={iconColor} /> : null}
      {typeof children === "string" || typeof children === "number" ? (
        <KidText
          className={cn(kidButton.text(p), isActive && kidButton.activeText, textClassName)}
          numberOfLines={1}
        >
          {children}
        </KidText>
      ) : (
        <View className="flex-row items-center gap-1">{children}</View>
      )}
    </Pressable>
  );
}
