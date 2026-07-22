import type { ComponentType } from "react";
import {
  IconAbc,
  IconAi,
  IconAlertCircle,
  IconArrowLeft,
  IconAtom,
  IconBan,
  IconBell,
  IconBook,
  IconBrain,
  IconCake,
  IconCalendar,
  IconCamera,
  IconChartBar,
  IconReceipt2,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconChevronUp,
  IconCircleCheck,
  IconClock,
  IconCode,
  IconCopy,
  IconDeviceGamepad2,
  IconDots,
  IconDownload,
  IconEye,
  IconEyeOff,
  IconEyeQuestion,
  IconFileDiff,
  IconFlask,
  IconHeart,
  IconHeartFilled,
  IconHistory,
  IconHome,
  IconImageGeneration,
  IconInfoCircle,
  IconLanguage,
  IconLoader2,
  IconLock,
  IconLogout,
  IconLogs,
  IconMasksTheater,
  IconMathSymbols,
  IconMenu2,
  IconMicrophone,
  IconMicrophoneOff,
  IconMusic,
  IconNumber123,
  IconPalette,
  IconPencil,
  IconPhoto,
  IconPhotoAi,
  IconPlayerPlayFilled,
  IconPlus,
  IconQrcode,
  IconRefresh,
  IconRobot,
  IconSearch,
  IconSeedling,
  IconSend,
  IconSettings,
  IconShare2,
  IconShieldLock,
  IconSortDescendingShapes,
  IconSparkles,
  IconSquare,
  IconSwitchVertical,
  IconTextGrammar,
  IconTrash,
  IconUpload,
  IconUser,
  IconUserPlus,
  IconUsers,
  IconVolume,
  IconWorldUp,
  IconX,
  type IconProps as TablerIconProps,
} from "@tabler/icons-react";

import { IconPhilosophy } from "@/components/shared/philosophy-icon";
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
  | "diff"
  | "dots"
  | "download"
  | "edit"
  | "feature_games"
  | "feature_personal"
  | "feature_privacy"
  | "feature_smart"
  | "friends"
  | "games"
  | "globe"
  | "heart"
  | "heart_filled"
  | "hide"
  | "history"
  | "home"
  | "info"
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
  | "upload"
  | "user_plus"
  | "agent_sessions"
  | "activities"
  | "event_logs"
  | "usage"
  | "volume"
  | "world_up"
  // Game-tag icons — Tabler slugs (see @dodi/games/tags); "philosophy" is custom.
  | "abc"
  | "123"
  | "math-symbols"
  | "pencil"
  | "text-grammar"
  | "book"
  | "image-generation"
  | "music"
  | "sort-descending-shapes"
  | "eye-question"
  | "philosophy"
  | "atom"
  | "flask"
  | "seedling"
  | "ai"
  | "photo"
  | "photo-ai";

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
  diff: IconFileDiff,
  dots: IconDots,
  download: IconDownload,
  edit: IconPencil,
  feature_games: IconDeviceGamepad2,
  feature_personal: IconPalette,
  feature_privacy: IconShieldLock,
  feature_smart: IconBrain,
  friends: IconUsers,
  games: IconDeviceGamepad2,
  globe: IconLanguage,
  heart: IconHeart,
  heart_filled: IconHeartFilled,
  history: IconHistory,
  hide: IconEyeOff,
  home: IconHome,
  info: IconInfoCircle,
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
  upload: IconUpload,
  user_plus: IconUserPlus,
  agent_sessions: IconRobot,
  activities: IconLogs,
  event_logs: IconLogs,
  usage: IconReceipt2,
  volume: IconVolume,
  world_up: IconWorldUp,
  // Game-tag icons (see @dodi/games/tags).
  abc: IconAbc,
  "123": IconNumber123,
  "math-symbols": IconMathSymbols,
  pencil: IconPencil,
  "text-grammar": IconTextGrammar,
  book: IconBook,
  "image-generation": IconImageGeneration,
  music: IconMusic,
  "sort-descending-shapes": IconSortDescendingShapes,
  "eye-question": IconEyeQuestion,
  philosophy: IconPhilosophy,
  atom: IconAtom,
  flask: IconFlask,
  seedling: IconSeedling,
  ai: IconAi,
  photo: IconPhoto,
  "photo-ai": IconPhotoAi,
};

export interface IconProps extends Omit<
  TablerIconProps,
  "size" | "stroke" | "aria-hidden"
> {
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
