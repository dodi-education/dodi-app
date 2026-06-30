import {
  IconBrain,
  IconDeviceGamepad2,
  IconLanguage,
  IconPalette,
  IconShieldLock,
  type IconProps as TablerIconProps,
} from "@tabler/icons-react";
import type { ComponentType } from "react";

import { cn } from "@/lib/utils";

// Only the icons the marketing site actually renders — kept tiny on purpose.
const ICONS = {
  feature_smart: IconBrain,
  feature_games: IconDeviceGamepad2,
  feature_privacy: IconShieldLock,
  feature_personal: IconPalette,
  globe: IconLanguage,
} satisfies Record<string, ComponentType<TablerIconProps>>;

export type IconName = keyof typeof ICONS;

export interface IconProps
  extends Omit<TablerIconProps, "size" | "stroke" | "aria-hidden"> {
  name: IconName;
  size?: number;
  stroke?: number;
  "aria-hidden"?: boolean;
}

export function Icon({
  name,
  size = 20,
  stroke = 1.75,
  className,
  "aria-hidden": ariaHidden,
  ...props
}: IconProps) {
  const IconComponent = ICONS[name];

  return (
    <IconComponent
      size={size}
      stroke={stroke}
      className={cn("shrink-0", className)}
      aria-hidden={ariaHidden ?? true}
      {...props}
    />
  );
}
