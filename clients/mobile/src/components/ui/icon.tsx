import { COLORS, type ColorToken } from "@dodi/design-tokens";

import * as T from "./icons";
import { IconPhilosophy } from "./philosophy-icon";

/** The web's semantic icon names (components/shared/icon.tsx), same Tabler icons. */
const ICONS = {
  activities: T.IconLogs,
  add: T.IconPlus,
  ai: T.IconAi,
  alert: T.IconAlertCircle,
  arrow_left: T.IconArrowLeft,
  ban: T.IconBan,
  bell: T.IconBell,
  calendar: T.IconCalendar,
  camera: T.IconCamera,
  check: T.IconCheck,
  chevron_down: T.IconChevronDown,
  chevron_right: T.IconChevronRight,
  clock: T.IconClock,
  close: T.IconX,
  code: T.IconCode,
  copy: T.IconCopy,
  dashboard: T.IconChartBar,
  delete: T.IconTrash,
  dots: T.IconDots,
  download: T.IconDownload,
  edit: T.IconPencil,
  external: T.IconExternalLink,
  friends: T.IconUsers,
  games: T.IconDeviceGamepad2,
  globe: T.IconLanguage,
  hide: T.IconEyeOff,
  info: T.IconInfoCircle,
  kids: T.IconUser,
  lock: T.IconLock,
  logout: T.IconLogout,
  memory: T.IconBrain,
  menu: T.IconMenu2,
  personas: T.IconMasksTheater,
  palette: T.IconPalette,
  wand: T.IconWand,
  qrcode: T.IconQrcode,
  refresh: T.IconRefresh,
  settings: T.IconSettings,
  show: T.IconEye,
  sparkles: T.IconSparkles,
  success: T.IconCircleCheck,
  switch_vertical: T.IconSwitchVertical,
  upload: T.IconUpload,
  usage: T.IconReceipt2,
  user_share: T.IconUserShare,
  world_up: T.IconWorldUp,
  // Game Studio
  diff: T.IconFileDiff,
  eraser: T.IconEraser,
  history: T.IconHistory,
  loading: T.IconLoader2,
  send: T.IconSend,
  stop: T.IconSquare,
  // Kid view (chrome, friends)
  cake: T.IconCake,
  home: T.IconHome,
  search: T.IconSearch,
  share: T.IconShare2,
  user_plus: T.IconUserPlus,
  wifi_off: T.IconWifiOff,
  volume: T.IconVolume,
  volume_low: T.IconVolume2,
  volume_off: T.IconVolumeOff,
  undo: T.IconArrowBackUp,
  // Kid games + snapshots
  heart: T.IconHeart,
  heart_filled: T.IconHeartFilled,
  play: T.IconPlayerPlayFilled,
  // Game-tag icons: Tabler slugs (see @dodi/games/tags); "philosophy" is custom.
  abc: T.IconAbc,
  "123": T.IconNumber123,
  "math-symbols": T.IconMathSymbols,
  pencil: T.IconPencil,
  "text-grammar": T.IconTextGrammar,
  book: T.IconBook,
  "image-generation": T.IconImageGeneration,
  music: T.IconMusic,
  "sort-descending-shapes": T.IconSortDescendingShapes,
  "eye-question": T.IconEyeQuestion,
  philosophy: IconPhilosophy,
  atom: T.IconAtom,
  flask: T.IconFlask,
  seedling: T.IconSeedling,
  photo: T.IconPhoto,
  "photo-ai": T.IconPhotoAi,
} as const;

export type IconName = keyof typeof ICONS;

export interface IconProps {
  name: IconName;
  /** Default 20, as on the web. */
  size?: number;
  /** Default 1.75, as on the web. */
  stroke?: number;
  /** A design-token color name (default "foreground"). */
  color?: ColorToken;
  /**
   * A data color from shared core values (e.g. a tag's `tagStyle().fg`),
   * where the web sets `style={{ color }}`. Wins over `color`. Never a literal.
   */
  tint?: string;
}

/** Decorative by default: label the control that holds it. */
export function Icon({ name, size = 20, stroke = 1.75, color = "foreground", tint }: IconProps) {
  const Component = ICONS[name];
  return (
    <Component
      size={size}
      strokeWidth={stroke}
      color={tint ?? COLORS[color]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}
