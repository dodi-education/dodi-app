import type { ComponentType } from "react";
import {
  IconAlertCircle,
  IconBrain,
  IconChartBar,
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconCircleCheck,
  IconCode,
  IconDeviceGamepad2,
  IconEye,
  IconEyeOff,
  IconHome,
  IconLanguage,
  IconLoader2,
  IconMasksTheater,
  IconMicrophone,
  IconMicrophoneOff,
  IconPalette,
  IconPlus,
  IconRefresh,
  IconRobot,
  IconSend,
  IconSettings,
  IconShieldLock,
  IconSquare,
  IconTrash,
  IconUser,
  IconUsers,
  IconVolume,
  IconX,
  type IconProps as TablerIconProps,
} from "@tabler/icons-react";

import { cn } from "@/lib/utils";

export type IconName =
  | "add"
  | "alert"
  | "check"
  | "chevron_down"
  | "chevron_up"
  | "close"
  | "code"
  | "dashboard"
  | "delete"
  | "feature_games"
  | "feature_personal"
  | "feature_privacy"
  | "feature_smart"
  | "friends"
  | "games"
  | "globe"
  | "hide"
  | "home"
  | "loading"
  | "mic_off"
  | "mic_on"
  | "personas"
  | "profiles"
  | "refresh"
  | "send"
  | "settings"
  | "show"
  | "stop"
  | "success"
  | "agent_sessions"
  | "system_logs"
  | "volume";

const ICONS: Record<IconName, ComponentType<TablerIconProps>> = {
  add: IconPlus,
  alert: IconAlertCircle,
  check: IconCheck,
  chevron_down: IconChevronDown,
  chevron_up: IconChevronUp,
  close: IconX,
  code: IconCode,
  dashboard: IconChartBar,
  delete: IconTrash,
  feature_games: IconDeviceGamepad2,
  feature_personal: IconPalette,
  feature_privacy: IconShieldLock,
  feature_smart: IconBrain,
  friends: IconUsers,
  games: IconDeviceGamepad2,
  globe: IconLanguage,
  hide: IconEyeOff,
  home: IconHome,
  loading: IconLoader2,
  mic_off: IconMicrophoneOff,
  mic_on: IconMicrophone,
  personas: IconMasksTheater,
  profiles: IconUser,
  refresh: IconRefresh,
  send: IconSend,
  settings: IconSettings,
  show: IconEye,
  stop: IconSquare,
  success: IconCircleCheck,
  agent_sessions: IconRobot,
  system_logs: IconBrain,
  volume: IconVolume,
};

export interface IconProps extends Omit<TablerIconProps, "size" | "stroke" | "aria-hidden"> {
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
