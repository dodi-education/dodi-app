import type { ComponentType } from "react";
import {
  IconAlertCircle,
  IconArrowLeft,
  IconBan,
  IconBell,
  IconBrain,
  IconCake,
  IconCalendar,
  IconCamera,
  IconChartBar,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconChevronUp,
  IconCircleCheck,
  IconClock,
  IconCode,
  IconCopy,
  IconDeviceGamepad2,
  IconEye,
  IconEyeOff,
  IconHome,
  IconLanguage,
  IconLoader2,
  IconLock,
  IconLogout,
  IconMasksTheater,
  IconMenu2,
  IconMicrophone,
  IconMicrophoneOff,
  IconPalette,
  IconPencil,
  IconPlayerPlayFilled,
  IconPlus,
  IconQrcode,
  IconRefresh,
  IconRobot,
  IconSearch,
  IconSend,
  IconSettings,
  IconShare2,
  IconShieldLock,
  IconSparkles,
  IconSquare,
  IconSwitchVertical,
  IconTrash,
  IconUser,
  IconUserPlus,
  IconUsers,
  IconVolume,
  IconX,
  type IconProps as TablerIconProps,
} from "@tabler/icons-react";

import { cn } from "@/lib/utils";

export type IconName =
  | "add"
  | "alert"
  | "arrow_left"
  | "ban"
  | "bell"
  | "cake"
  | "calendar"
  | "camera"
  | "check"
  | "chevron_down"
  | "chevron_right"
  | "chevron_up"
  | "clock"
  | "close"
  | "code"
  | "copy"
  | "dashboard"
  | "delete"
  | "edit"
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
  | "lock"
  | "logout"
  | "memory"
  | "menu"
  | "mic_off"
  | "mic_on"
  | "personas"
  | "play"
  | "kids"
  | "qrcode"
  | "refresh"
  | "search"
  | "send"
  | "settings"
  | "share"
  | "show"
  | "sparkles"
  | "stop"
  | "success"
  | "switch_vertical"
  | "user_plus"
  | "agent_sessions"
  | "system_logs"
  | "volume";

const ICONS: Record<IconName, ComponentType<TablerIconProps>> = {
  add: IconPlus,
  alert: IconAlertCircle,
  arrow_left: IconArrowLeft,
  ban: IconBan,
  bell: IconBell,
  cake: IconCake,
  calendar: IconCalendar,
  camera: IconCamera,
  check: IconCheck,
  chevron_down: IconChevronDown,
  chevron_right: IconChevronRight,
  chevron_up: IconChevronUp,
  clock: IconClock,
  close: IconX,
  code: IconCode,
  copy: IconCopy,
  dashboard: IconChartBar,
  delete: IconTrash,
  edit: IconPencil,
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
  lock: IconLock,
  logout: IconLogout,
  memory: IconBrain,
  menu: IconMenu2,
  mic_off: IconMicrophoneOff,
  mic_on: IconMicrophone,
  personas: IconMasksTheater,
  play: IconPlayerPlayFilled,
  kids: IconUser,
  qrcode: IconQrcode,
  refresh: IconRefresh,
  search: IconSearch,
  send: IconSend,
  settings: IconSettings,
  share: IconShare2,
  show: IconEye,
  sparkles: IconSparkles,
  stop: IconSquare,
  success: IconCircleCheck,
  switch_vertical: IconSwitchVertical,
  user_plus: IconUserPlus,
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
