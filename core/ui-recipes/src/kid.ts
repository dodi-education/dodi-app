/**
 * Recipes: the kid view (web: app/(kid) + components/kid): the chrome (header,
 * kid switcher, bottom nav), the avatar-PIN puzzle, KidButton, the home stage
 * and the friends screens. Same box / text / web split as primitives.ts;
 * values are the web's phone layout.
 *
 * Kid text is Nunito: the web sets `font-kid` once on the kid root, the app's
 * kid components add it to each Text (React Native doesn't inherit fonts).
 * Arbitrary box-shadows live in `web*`; the app draws them with
 * {@link kidShadow} (React Native style props).
 */
import { cva } from "class-variance-authority";

/** The app's renderings of the web's arbitrary kid shadows (RN shadow* + elevation). */
export const kidShadow = {
  /** shadow-[0_2px_10px_rgba(34,56,78,0.05)]: rows, small cards. */
  row: { color: "#22384E", opacity: 0.05, radius: 10, offsetY: 2, elevation: 1 },
  /** shadow-[0_4px_18px_rgba(34,56,78,0.06)]: the big white cards. */
  card: { color: "#22384E", opacity: 0.06, radius: 18, offsetY: 4, elevation: 2 },
  /** shadow-[0_4px_16px_rgba(34,56,78,0.08)]: the speech bubble. */
  bubble: { color: "#22384E", opacity: 0.08, radius: 16, offsetY: 4, elevation: 2 },
  /** shadow-[0_20px_56px_rgba(34,56,78,0.24)]: the switcher popover. */
  popover: { color: "#22384E", opacity: 0.24, radius: 56, offsetY: 20, elevation: 12 },
  /** shadow-[0_3px_10px_rgba(47,107,216,0.28)]: the filled play pill. */
  play: { color: "#2F6BD8", opacity: 0.28, radius: 10, offsetY: 3, elevation: 3 },
  /** shadow-[0_2px_8px_rgba(34,56,78,0.08)]: the selected segment. */
  segment: { color: "#22384E", opacity: 0.08, radius: 8, offsetY: 2, elevation: 1 },
  /** Tailwind `shadow` / `shadow-sm`. */
  sm: { color: "#000000", opacity: 0.1, radius: 3, offsetY: 1, elevation: 1 },
  /** Tailwind `shadow-lg`: the volume flyout. */
  lg: { color: "#000000", opacity: 0.1, radius: 15, offsetY: 10, elevation: 6 },
} as const;

export type KidShadow = keyof typeof kidShadow;

// ----- KidButton ----------------------------------------------------------------

const kidButtonVariant = { play: "", ghost: "", icon: "", chip: "", back: "" } as const;
const kidButtonSize = { default: "", sm: "", lg: "", none: "" } as const;
export type KidButtonVariant = keyof typeof kidButtonVariant;
export type KidButtonSize = keyof typeof kidButtonSize;

/** The kid view's pill buttons (web: components/kid/kid-button). */
export const kidButton = {
  box: cva("flex-row items-center justify-center gap-2 rounded-full disabled:opacity-50", {
    variants: {
      variant: {
        ...kidButtonVariant,
        play: "bg-primary",
        ghost: "bg-transparent",
        icon: "size-[38px] bg-transparent p-0",
        chip: "bg-white/65",
        back: "bg-white/70",
      },
      size: { ...kidButtonSize, default: "px-6 py-2.5", sm: "px-4 py-2", lg: "px-7 py-3" },
    },
    defaultVariants: { variant: "play", size: "default" },
  }),
  text: cva("font-extrabold", {
    variants: {
      variant: {
        ...kidButtonVariant,
        play: "text-white",
        ghost: "text-muted-foreground",
        icon: "text-faint",
        chip: "text-muted-foreground",
        back: "text-muted-foreground",
      },
      size: { ...kidButtonSize, default: "text-[14.5px]", sm: "text-[13.5px]", lg: "text-[15px]" },
    },
    defaultVariants: { variant: "play", size: "default" },
  }),
  web: cva(
    "inline-flex whitespace-nowrap transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary-soft-2 disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0",
    {
      variants: {
        variant: {
          ...kidButtonVariant,
          play: "shadow-[0_3px_10px_rgba(47,107,216,0.28)] duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:bg-primary-hover hover:-translate-y-px active:scale-95",
          ghost: "hover:bg-muted hover:text-ink",
          icon: "hover:bg-danger-soft hover:text-danger",
          chip: "hover:bg-white data-[active=true]:bg-ink data-[active=true]:text-white",
          back: "hover:bg-white hover:text-ink",
        },
        size: {
          ...kidButtonSize,
          default: "[&_svg:not([class*='size-'])]:size-4",
          sm: "[&_svg:not([class*='size-'])]:size-3.5",
          lg: "[&_svg:not([class*='size-'])]:size-[17px]",
        },
      },
      defaultVariants: { variant: "play", size: "default" },
    },
  ),
  /** The app: a selected chip (web: data-[active=true]). */
  activeBox: "bg-ink",
  activeText: "text-white",
};

/** Default icon size per KidButton size (web: the `[&_svg]` sizes). */
export const kidButtonIconSize = { default: 16, sm: 14, lg: 17, none: 16 } as const satisfies Record<
  KidButtonSize,
  number
>;

/** Icon color per KidButton variant (the label color, as a design-token name). */
export const kidButtonIconColor = {
  play: "primary-foreground",
  ghost: "muted-foreground",
  icon: "faint",
  chip: "muted-foreground",
  back: "muted-foreground",
} as const satisfies Record<KidButtonVariant, string>;

// ----- Chrome -------------------------------------------------------------------

/** The kid view's frame (web: components/kid/kid-chrome). */
export const kidChrome = {
  webRoot: "flex min-h-screen flex-col font-kid",
  /** The non-sticky header: switcher + compact dodi on the left, Parent on the right. */
  header: "flex-row items-center justify-between px-4 py-3",
  webHeader: "flex md:px-6 md:py-4",
  headerLeft: "min-w-0 shrink flex-row items-center gap-3",
  webHeaderLeft: "flex",
  /** "Parent": back to the parent area (behind its PIN). */
  parentLink: "shrink-0 flex-row items-center gap-1.5 rounded-lg px-2.5 py-2",
  parentLinkText: "text-sm font-bold text-faint",
  webParentLink: "flex transition-colors hover:text-muted-foreground",
  parentIcon: { size: 15 },
  /** The page column above the bottom nav. */
  main: "flex-1 flex-col items-center px-4 pb-24",
  webMain: "flex",
  /** Full-mode game views (play/edit/create) own their layout. */
  mainFull: "flex-1 flex-col px-4 pb-24",
  webMainFull: "flex",
  mainFullInner: "mx-auto w-full max-w-6xl",
} as const;

/** The bottom navigation: Home, Games, Snapshots, Friends. */
export const kidNav = {
  /** The app positions it absolutely and adds the safe-area inset to pt-2.5's 0.75rem bottom. */
  box: "absolute bottom-0 left-0 right-0 z-40 flex-row items-center justify-center gap-3 border-t border-border bg-white/85 px-4 pt-2.5",
  web: "fixed flex pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] backdrop-blur-md",
  /** The bottom padding before the safe-area inset (0.75rem). */
  paddingBottom: 12,
  item: "min-w-[88px] flex-col items-center gap-1 rounded-2xl px-5 py-2",
  itemText: "text-[13.5px] font-extrabold",
  webItem: "flex transition-colors sm:min-w-[110px]",
  activeItem: "bg-primary-soft",
  activeText: "text-primary",
  inactiveText: "text-faint",
  webInactive: "hover:text-muted-foreground",
  icon: { size: 24, stroke: 2 },
} as const;

/** Placeholder while the E2EE kid list loads. */
export const kidLoadingStage = {
  root: "my-auto flex-col items-center gap-6",
  webRoot: "flex",
  circle: "h-40 w-40 rounded-full bg-dodi-100",
  bar: "h-6 w-32 rounded-lg bg-dodi-100",
  webPulse: "animate-pulse",
} as const;

/** Behind the auto-opened switcher puzzle while a locked profile is gated. */
export const kidGateHint = {
  root: "my-auto flex-col items-center gap-4",
  webRoot: "flex text-center",
  avatarWrap: "relative opacity-70",
  lockBadge: "absolute -bottom-1 -right-1 size-9 items-center justify-center rounded-full bg-white",
  lockBadgeText: "text-faint",
  webLockBadge: "flex shadow",
  text: "max-w-[16rem] text-sm font-bold text-muted-foreground",
  textAlign: "text-center",
} as const;

// ----- Kid switcher -------------------------------------------------------------

/** The header's "Who's playing?" switcher (web: components/kid/kid-switcher). */
export const kidSwitcher = {
  /** Placeholder before any kid is known. */
  empty: "h-10 w-10 rounded-full bg-primary-soft-2",
  pill: "flex-row items-center gap-2.5 rounded-full bg-white/70 py-1.5 pl-1.5 pr-4",
  pillText: "text-[15px] font-extrabold text-ink",
  webPill: "flex transition hover:bg-white",
  pillAvatarEmpty: "size-[34px] rounded-full bg-primary-soft-2",
  pillName: "max-w-[120px]",
  webPillName: "truncate",
  chevron: { size: 16 },
  webChevron: "transition-transform",
  webChevronOpen: "rotate-180",
  /** The popover (the app shows it as an overlay under the header). */
  popover: "z-50 mt-2.5 rounded-[22px] bg-white p-4",
  webPopover: "absolute left-0 top-full w-[400px] max-w-[calc(100vw-2rem)] shadow-[0_20px_56px_rgba(34,56,78,0.24)]",
  head: "mb-2.5 flex-row items-center justify-between",
  webHead: "flex",
  label: "text-[12.5px] font-extrabold uppercase tracking-[0.06em] text-faint",
  close: "size-7 items-center justify-center rounded-full bg-muted",
  closeText: "text-muted-foreground",
  webClose: "flex transition-colors hover:bg-border hover:text-ink",
  list: "flex-col gap-1",
  webList: "flex",
  row: "w-full flex-row items-center gap-3 rounded-2xl px-2.5 py-[7px]",
  webRow: "flex text-left transition-colors hover:bg-muted",
  rowActive: "bg-primary-soft",
  rowPending: "bg-muted",
  rowName: "flex-1 text-base font-extrabold text-ink",
  divider: "my-3 h-px bg-border",
  puzzleHead: "mb-1 flex-row items-center justify-between",
  webPuzzleHead: "flex",
  cancel: "rounded-[9px] px-2 py-1",
  cancelText: "text-[13px] font-bold text-muted-foreground",
  webCancel: "transition-colors hover:bg-muted hover:text-ink",
  hint: "mb-4 text-[13px] font-semibold text-muted-foreground",
  /** The look editor. */
  lookHead: "mb-3 flex-row items-center gap-3.5",
  webLookHead: "flex",
  lookHint: "mt-[3px] text-[13px] font-semibold text-muted-foreground",
  colors: "mb-3.5 flex-row gap-2.5",
  webColors: "flex",
  color: "size-[34px] items-center justify-center rounded-full",
  webColor: "flex outline-[2.5px] outline-offset-2 transition hover:scale-110",
  colorDot: "rounded-full",
  webColorDot: "transition-transform",
  /** The scrolling avatar grid (max 244px tall). */
  grid: "-mx-1 max-h-[244px] px-1",
  webGrid: "overflow-y-auto",
  groupLabel: "mx-0.5 mb-2 mt-3 text-[12px] font-extrabold uppercase tracking-[0.05em] text-faint",
  /** The app drops the first group's top margin itself (no `first:`). */
  groupLabelFirst: "mt-0.5",
  webGroupLabel: "first:mt-0.5",
  /** Six per row; the app lays them out with flex-wrap. */
  gridRow: "flex-row flex-wrap gap-2",
  webGridRow: "grid grid-cols-6",
  tile: "relative aspect-square overflow-hidden rounded-[16px] p-1",
  webTile: "outline-[2.5px] -outline-offset-[2.5px] transition hover:-translate-y-0.5",
  tileImage: "h-full w-full rounded-[11px]",
  webTileImage: "object-contain",
  tileCheck: "absolute bottom-[3px] right-[3px] size-[18px] items-center justify-center rounded-full",
  tileCheckText: "text-white",
  webTileCheck: "flex shadow",
} as const;

/** Sizes in the switcher (avatars, icons). */
export const kidSwitcherSizes = {
  pillAvatar: 34,
  rowAvatar: 42,
  lookAvatar: 76,
  lookAvatarPad: 5,
  colorDot: 15,
  closeIcon: 15,
  rowLockIcon: 19,
  rowCheckIcon: 20,
  rowLockedIcon: 16,
  tileCheckIcon: 12,
  /** The selection ring (web: outline 2.5px). */
  ring: 2.5,
} as const;

// ----- Avatar PIN puzzle --------------------------------------------------------

/** 3 slots filled by tapping avatars (web: components/kid/avatar-pin-puzzle). */
export const pinPuzzle = {
  slots: "mb-[18px] flex-row justify-center gap-3.5",
  webSlots: "flex",
  webShake: "animate-pin-shake",
  slot: "h-[62px] w-[62px] items-center justify-center overflow-hidden rounded-[18px] border-[2.5px]",
  webSlot: "flex transition-colors",
  slotFilled: "border-solid border-primary bg-white",
  slotActive: "border-solid border-primary bg-primary-soft",
  slotEmpty: "border-dashed border-border bg-muted",
  slotImage: "h-full w-full p-[5px]",
  webSlotImage: "object-contain",
  dot: "h-3 w-3 rounded-full",
  dotActive: "bg-primary",
  dotIdle: "bg-border",
  /** Four per row; the app lays them out with flex-wrap. */
  palette: "flex-row flex-wrap gap-2.5",
  webPalette: "grid grid-cols-4",
  tile: "aspect-square overflow-hidden rounded-[14px] bg-muted p-[5px]",
  webTile: "transition hover:-translate-y-0.5 hover:bg-primary-soft",
  tileImage: "h-full w-full",
  webTileImage: "object-contain",
} as const;

// ----- Home -----------------------------------------------------------------------

/** "No kid selected" on the home page. */
export const kidHomeEmpty = {
  box: "my-auto w-full max-w-xs rounded-[20px] bg-white p-5",
  web: "text-center shadow-[0_2px_10px_rgba(34,56,78,0.05)]",
  text: "text-sm font-bold text-muted-foreground",
  textAlign: "text-center",
} as const;

/** The home stage around the companion (web: components/dodi/dodi-full-home). */
export const kidHomeStage = {
  root: "w-full flex-1 flex-col items-center",
  webRoot: "flex",
  inner: "my-auto flex-col items-center gap-5 py-4",
  webInner: "flex",
  /** The mascot box: clamp(170px, 38vh, 300px) square; the figure fills 76%. */
  mascot: "relative aspect-square items-center justify-center",
  webMascot: "flex w-[clamp(170px,38vh,300px)] md:w-[min(395px,55vh)]",
  mascotMin: 170,
  mascotMax: 300,
  mascotVh: 0.38,
  figure: "size-[76%]",
  bubbleWrap: "w-full max-w-xs",
  greeting: "text-lg font-extrabold text-ink",
  line: "mt-1 text-sm font-bold text-ink-2",
  hint: "mt-1 text-xs font-semibold text-muted-foreground",
  textAlign: "text-center",
  offlineRow: "flex-row items-center justify-center gap-2",
  webOfflineRow: "flex",
} as const;

/** dodi's speech bubble (web: components/dodi/speech-bubble). */
export const speechBubble = {
  box: "relative rounded-[18px] bg-white px-7 py-3",
  text: "font-bold text-ink-2",
  web: "shadow-[0_4px_16px_rgba(34,56,78,0.08)]",
  /** The tail pointing up at dodi (a rotated square). */
  tail: "absolute -top-[7px] left-1/2 size-3.5 rotate-45 rounded-[3px] bg-white",
  webTail: "-translate-x-1/2",
  /** The app centers the 14px tail with a -7px margin (no translate classes). */
  tailOffset: -7,
  inner: "relative",
} as const;

/**
 * The 3D character's box (web: components/dodi/dodi-character-3d, app:
 * components/dodi/character-3d): it fills the figure's box, and its drawing
 * surface reaches past it, centred.
 */
export const companionCharacter = {
  host: "absolute inset-0",
  surface: "absolute",
} as const;

/**
 * The Playground on kid home (web and app: components/kid/playground): the masks badge on the stage's side, and the tools
 * panel that fades in around the character (a bottom sheet on phones, a card
 * beside the character from md up).
 */
export const playground = {
  badge:
    "absolute right-3 top-1/2 z-20 h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-dodi-200 bg-white",
  webBadge: "flex shadow-sm transition-shadow hover:shadow-md md:right-6",
  /** Open on a phone: the badge sits just above the panel's top right corner. */
  badgeOpen: "top-auto bottom-1/2 mb-2 translate-y-0 border-dodi-500 bg-dodi-500",
  /** From md up the panel is a side card, so the badge stays centred beside it. */
  webBadgeOpen: "md:top-1/2 md:bottom-auto md:mb-0 md:-translate-y-1/2",
  badgeIcon: 24,
  badgeIconColor: "text-ink-2",
  badgeIconOpenColor: "text-white",
  /** On a phone the panel fills the stage's bottom half; the character keeps the top half. */
  panel: "absolute inset-x-2 bottom-2 top-1/2 z-20 gap-3 rounded-3xl border border-dodi-200 bg-white p-4",
  webPanel:
    "flex flex-col overflow-y-auto shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-200 motion-reduce:animate-none md:inset-x-auto md:bottom-auto md:right-24 md:top-1/2 md:max-h-[86%] md:w-[340px] md:-translate-y-1/2",
  /** The stage's column while open on a phone: the character centred in the top half. */
  stageOpen: "my-0 h-1/2 justify-center py-2",
  webStageOpen: "max-md:my-0 max-md:h-1/2 max-md:justify-center max-md:py-2",
  /** Share of the window height the character may take while open on a phone. */
  mascotOpenVh: 0.3,
  title: "text-base font-extrabold text-ink",
  tagline: "text-xs font-semibold text-muted-foreground",
  tabs: "flex-row gap-1 rounded-full bg-dodi-50 p-1",
  webTabs: "flex",
  tab: "min-h-11 flex-1 items-center justify-center rounded-full px-2",
  webTab: "flex cursor-pointer transition-colors",
  tabActive: "bg-white",
  tabText: "text-[13px] font-extrabold text-ink-2",
  tabTextActive: "text-dodi-500",
  section: "gap-2",
  webSection: "flex flex-col",
  label: "text-[13px] font-bold text-ink-2",
  hint: "text-[13px] font-semibold text-muted-foreground",
  row: "flex-row flex-wrap gap-2",
  webRow: "flex",
  swatch: "h-11 w-11 rounded-full border-[3px] border-white",
  webSwatch: "cursor-pointer shadow-sm ring-1 ring-dodi-200 transition-transform active:scale-95",
  swatchSelected: "border-dodi-500",
  chip: "min-h-11 flex-row items-center gap-2 rounded-full border border-dodi-200 bg-white px-4",
  webChip: "flex cursor-pointer transition-colors disabled:cursor-not-allowed disabled:opacity-50",
  chipSelected: "border-dodi-500 bg-dodi-50",
  chipText: "text-sm font-bold text-ink",
  input: "min-h-11 rounded-2xl border border-dodi-200 bg-white px-4 text-base font-bold text-ink",
  webInput: "w-full outline-none focus-visible:ring-2 focus-visible:ring-dodi-500",
  trick: "min-h-11 flex-row items-center gap-2 rounded-2xl bg-dodi-50 px-3 py-1.5",
  webTrick: "flex",
  trickName: "flex-1 text-sm font-bold text-ink",
  trickDisabled: "opacity-50",
  status: "text-xs font-bold text-ink-2",
} as const;

/**
 * Thought bubbles above the 3D character's head while it thinks (web:
 * components/dodi/think-bubbles, app: the same): two small puffs rising to a
 * round bubble with a turning gear. Positions are shares of the figure's box.
 */
export const thinkBubbles = {
  root: "absolute left-[60%] top-[-10%] h-[34%] w-[38%]",
  puffSmall: "absolute bottom-0 left-0 h-2.5 w-2.5 rounded-full border-2 border-dodi-700 bg-white",
  puffMedium: "absolute bottom-[26%] left-[16%] h-4 w-4 rounded-full border-2 border-dodi-700 bg-white",
  bubble: "absolute right-0 top-0 h-14 w-14 items-center justify-center rounded-full border-[2.5px] border-dodi-700 bg-white",
  webBubble: "flex shadow-sm",
  gearSize: 32,
  gearColor: "text-dodi-700",
  /** One turn of the gear. */
  spinMs: 2400,
  /** Delay between the puffs and the bubble appearing, in order. */
  staggerMs: 140,
} as const;

/** The header's compact companion (web: components/dodi/dodi-compact). */
export const companionCompact = {
  root: "min-w-0 shrink flex-row items-center gap-2.5",
  webRoot: "flex",
  button: "relative h-10 w-10 shrink-0 items-center justify-center rounded-full border border-dodi-200 bg-white",
  webButton: "flex shadow-sm transition-shadow hover:shadow-md disabled:opacity-60",
  /** The app dims the disabled (connecting) button as the web's disabled:opacity-60. */
  disabled: "opacity-60",
  head: 32,
  /** The thinking head turns (web: animate-kspin). */
  webThinking: "animate-kspin",
  /** Speaking: a ring pinging out of the button. */
  speakingRing: "absolute inset-0 rounded-full border-2 border-dodi-400 opacity-40",
  webSpeakingRing: "animate-ping",
  /** Connecting: a spinning ring (its top edge open). */
  connectingRing: "absolute inset-0 rounded-full border-2 border-dodi-400 border-t-transparent",
  webConnectingRing: "animate-spin",
  /** Offline badge at the bottom right, with a 10px wifi-off icon. */
  offlineBadge: "absolute -bottom-1 -right-1 h-4 w-4 items-center justify-center rounded-full border border-dodi-200 bg-white",
  webOfflineBadge: "flex",
  offlineIcon: 10,
  /** Status dot at the bottom right: connected (success) or a failed connect (danger). */
  statusDot: "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white",
  connectedDot: "bg-success",
  errorDot: "bg-danger",
  /** The status bubble's live region (always present, empty when idle). */
  liveRegion: "min-w-0 shrink",
  /** The status bubble beside the avatar while dodi is doing something. */
  bubble: "relative h-10 min-w-0 shrink flex-row items-center rounded-full bg-white px-3.5",
  webBubble: "flex shadow-sm animate-in fade-in slide-in-from-left-2 duration-200",
  /** Its tail pointing left at the avatar (a rotated square, centred vertically). */
  bubbleTail: "absolute -left-1 top-1/2 size-2.5 rotate-45 rounded-[2px] bg-white",
  webBubbleTail: "-translate-y-1/2",
  /** The app centres the 10px tail with a -5px margin (no translate classes). */
  bubbleTailOffset: -5,
  bubbleText: "relative min-w-0 shrink text-[13px] font-bold text-ink-2",
  webBubbleText: "truncate",
} as const;

/**
 * Two soft radial pulses behind dodi while it listens (web:
 * components/kid/listening-pulse). The gradient is the `rgb` color at
 * `centerOpacity` in the middle, fading out by `fadeStopPercent`. Motion (web:
 * animate-kpulse / -2): scale 0.8 → 1.25 while the opacity rises to 1 at 40%
 * and falls back to 0, over 2.6 s, the second pulse half a period later.
 * Reduced motion holds both still at half opacity.
 */
export const listeningPulse = {
  circle: "absolute inset-6 rounded-full",
  webFirst: "animate-kpulse",
  webSecond: "animate-kpulse-2",
  rgb: "95,155,216",
  centerOpacity: 0.22,
  fadeStopPercent: 70,
  durationMs: 2600,
  staggerMs: 1300,
  scaleFrom: 0.8,
  scaleTo: 1.25,
  peakAt: 0.4,
  reducedOpacity: 0.5,
} as const;

/**
 * dodi talking: three dots rising in turn (web: animate-kdot, 1.2 s, 200 ms
 * apart; opacity 0.25 → 1 and up 4px at the midpoint).
 */
export const speakingDots = {
  row: "flex-row gap-1",
  webRow: "flex",
  dot: "h-2 w-2 rounded-full bg-primary",
  webDot: "inline-block animate-kdot",
  durationMs: 1200,
  staggerMs: 200,
  rise: 4,
  restOpacity: 0.25,
} as const;

/** The home stage's conversation states (web: components/dodi/dodi-full-home). */
export const kidHomeTalk = {
  /** The tappable mascot (talk / wake), filling 76% of the box. */
  mascotButton: "relative z-[1] size-[76%]",
  webMascotButton:
    "cursor-pointer transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] active:scale-[0.94]",
  /** Bubble + hint column under the mascot. */
  column: "w-full max-w-xs flex-col items-center gap-3",
  webColumn: "flex",
  bubble: "w-full",
  status: "text-sm font-bold text-ink-2",
  statusRow: "flex-row items-center justify-center gap-2",
  webStatusRow: "flex",
  /** The "tap to talk" hint below the bubble (kept as a spacer when empty). */
  tapHint: "text-sm font-bold text-faint",
  retry: "rounded-full font-bold",
  webRetry: "cursor-pointer",
} as const;

/**
 * The header's volume control (web: components/kid/companion-volume-control):
 * a round button opening a flyout with the volume slider and the mute-all
 * toggle. Output only: neither changes whether dodi listens.
 */
export const companionVolume = {
  root: "relative shrink-0",
  button: "relative h-11 w-11 items-center justify-center rounded-full border border-dodi-200 bg-white",
  webButton: "flex shadow-sm transition-shadow hover:shadow-md",
  /** Muted: the icon turns red. */
  mutedButtonText: "text-danger",
  icon: 20,
  flyout: "absolute left-0 top-full z-50 mt-2 w-56 rounded-2xl border border-dodi-200 bg-white p-4",
  webFlyout: "shadow-lg animate-in fade-in slide-in-from-top-1 duration-150",
  /** The app places the flyout under the button itself (mt-2 = 8pt) in a modal layer. */
  flyoutGap: 8,
  flyoutWidth: 224,
  label: "mb-2 text-[13px] font-bold text-ink-2",
  webLabel: "block",
  webSlider:
    "h-11 w-full cursor-pointer accent-dodi-500 disabled:cursor-not-allowed disabled:opacity-50",
  /** The app's slider (the web uses the native range input). */
  slider: "h-11 w-full justify-center",
  sliderDisabled: "opacity-50",
  track: "h-1.5 w-full rounded-full bg-dodi-200",
  fill: "absolute left-0 h-1.5 rounded-full bg-dodi-500",
  thumb: "absolute h-5 w-5 rounded-full border-2 border-white bg-dodi-500",
  thumbSize: 20,
  mute: "mt-2 h-11 w-full flex-row items-center justify-center gap-2 rounded-xl border",
  webMute: "flex transition-colors",
  muteText: "text-[13px] font-bold",
  muteOn: "border-danger/30 bg-danger/10",
  muteOnText: "text-danger",
  muteOff: "border-dodi-200 bg-white",
  muteOffText: "text-ink-2",
  webMuteOff: "hover:bg-dodi-50",
  muteIcon: 16,
} as const;

// ----- Friends ------------------------------------------------------------------

/** A centered state on the friends tab (offline, locked, loading). */
export const friendsCentered = {
  box: "flex-1 flex-col items-center justify-center gap-3 py-16",
  text: "text-sm font-semibold text-muted-foreground",
  textAlign: "text-center",
  web: "flex",
} as const;

/** The friends tab without an active kid (web: app/(kid)/friends/page). */
export const friendsNoKid = {
  root: "my-auto flex-col items-center gap-3 py-8",
  webRoot: "flex text-center",
  text: "text-sm font-semibold text-muted-foreground",
  textAlign: "text-center",
} as const;

/** The friends list (web: components/kid/friends/friends-list). */
export const friendsList = {
  root: "mx-auto w-full max-w-5xl pb-8",
  head: "mb-4 flex-row items-center justify-between gap-4",
  webHead: "flex",
  title: "text-[27px] font-extrabold tracking-tight text-ink",
  /** The app shrinks the title block so the Add button keeps its width. */
  titleBlock: "min-w-0 flex-1",
  count: "mt-0.5 text-sm font-semibold text-muted-foreground",
  filters: "mb-6 flex-row flex-wrap items-center gap-2",
  webFilters: "flex",
  search: "w-[280px] flex-row items-center gap-2.5 rounded-full bg-white px-[18px] py-[9px]",
  /** The app's ring (web: an inset box-shadow). */
  searchBorder: "border-[1.5px] border-border",
  searchText: "text-faint",
  webSearch: "flex shadow-[inset_0_0_0_1.5px_var(--color-border)] focus-within:shadow-[inset_0_0_0_2px_var(--color-primary-soft-2)]",
  /** The app's focused search (web: focus-within inset ring). */
  searchFocused: "border-2 border-primary-soft-2",
  searchInput: "min-w-0 flex-1 bg-transparent text-sm font-bold text-ink",
  webSearchInput: "outline-none placeholder:font-semibold placeholder:text-faint",
  chipCount: "ml-1 h-[19px] min-w-[19px] items-center justify-center rounded-full px-1.5",
  chipCountText: "text-[11.5px] font-extrabold text-white",
  webChipCount: "inline-flex",
  chipCountActive: "bg-white/30",
  chipCountIdle: "bg-border-strong",
  sectionLabel: "mb-2.5 mt-[18px] text-[13px] font-extrabold uppercase tracking-[0.06em] text-faint",
  /** The app drops the first label's top margin itself (no `first:`). */
  sectionLabelFirst: "mt-1",
  webSectionLabel: "first:mt-1",
  rows: "flex-col gap-2.5",
  webRows: "flex",
  empty: "flex-col items-center gap-3.5 px-5 py-14",
  webEmpty: "flex text-center",
  emptyIcon: "size-[72px] items-center justify-center rounded-full bg-primary-soft",
  emptyIconText: "text-primary",
  webEmptyIcon: "flex",
  emptyText: "max-w-[300px] text-[15.5px] font-bold leading-relaxed text-muted-foreground",
  textAlign: "text-center",
} as const;

/** One friend / request / blocked row (web: components/kid/friends/friend-row). */
export const friendRow = {
  box: "w-full flex-row items-center gap-3.5 rounded-[18px] bg-white px-4 py-3",
  web: "flex text-left shadow-[0_2px_10px_rgba(34,56,78,0.05)]",
  webOpen:
    "transition-all duration-150 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(34,56,78,0.1)] active:scale-[0.985]",
  /** An incoming request (web: an outline; the app: a border). */
  incoming: "border-[1.5px] border-primary-soft-2",
  webIncoming: "outline outline-[1.5px] outline-primary-soft-2",
  blocked: "opacity-90",
  main: "min-w-0 flex-1",
  name: "text-[16.5px] font-extrabold text-ink",
  nameSuffix: "font-bold text-faint",
  status: "text-[13px] font-bold",
  webStatus: "truncate",
  statusRequest: "text-primary",
  statusMuted: "text-faint",
  actions: "shrink-0 flex-row items-center gap-2",
  webActions: "flex",
  decline: "size-10 items-center justify-center rounded-full bg-muted disabled:opacity-50",
  declineText: "text-muted-foreground",
  webDecline: "flex transition-colors hover:bg-danger-soft hover:text-danger",
  accept: "flex-row items-center gap-1.5 rounded-full bg-primary px-4 py-2.5 disabled:opacity-50",
  acceptText: "text-sm font-extrabold text-white",
  webAccept: "inline-flex shadow-[0_3px_9px_rgba(47,107,216,0.26)] transition-colors hover:bg-primary-hover active:scale-95",
  waiting: "flex-row items-center gap-1.5 rounded-full bg-muted px-3 py-[7px]",
  waitingText: "text-[13px] font-extrabold text-muted-foreground",
  webWaiting: "inline-flex",
  unblock: "rounded-full bg-muted px-[18px] py-2.5 disabled:opacity-50",
  unblockText: "text-sm font-extrabold text-ink-2",
  webUnblock: "transition-colors hover:bg-primary-soft hover:text-primary",
} as const;

/** A friend's page (web: components/kid/friends/friend-profile). */
export const friendProfile = {
  root: "mx-auto w-full max-w-[460px] px-5 pb-8",
  /** The back pill's extra left padding. */
  back: "pl-3",
  card: "mt-1.5 flex-col items-center rounded-[26px] bg-white px-6 pb-7 pt-8",
  webCard: "flex shadow-[0_4px_18px_rgba(34,56,78,0.06)]",
  name: "mt-4 text-[26px] font-extrabold tracking-tight text-ink",
  nickname: "mt-0.5 text-[15px] font-bold text-faint",
  badge: "mt-3.5 flex-row items-center gap-1.5 rounded-full bg-success-soft px-3 py-1.5",
  badgeText: "text-[12.5px] font-extrabold text-success",
  webBadge: "inline-flex",
  facts: "mt-6 w-full overflow-hidden rounded-[18px] bg-muted",
  fact: "flex-row items-center gap-3 px-[18px] py-[15px]",
  webFact: "flex",
  factDivider: "border-t border-border",
  factIcon: "shrink-0",
  webFactIcon: "flex text-faint",
  factLabel: "text-[14.5px] font-bold text-muted-foreground",
  factValue: "ml-auto text-right text-[14.5px] font-extrabold text-ink",
  actions: "mt-4 flex-row gap-2.5",
  webActions: "flex",
  action: "flex-1 flex-row items-center justify-center gap-2 rounded-2xl border-[1.5px] border-border-strong bg-white px-3.5 py-3 disabled:opacity-50",
  webAction: "inline-flex transition-colors",
  actionText: "text-[14.5px] font-extrabold",
  blockText: "text-ink-2",
  webBlock: "hover:border-ink-2 hover:text-ink",
  removeText: "text-danger",
  webRemove: "hover:border-danger hover:bg-danger-soft",
} as const;

/** Add a friend: code, scan, my code (web: components/kid/friends/add-friend). */
export const addFriend = {
  root: "mx-auto w-full max-w-[460px] px-5 pb-8",
  title: "mb-4 mt-1 text-2xl font-extrabold tracking-tight text-ink",
  segments: "mb-[18px] flex-row gap-1 rounded-2xl bg-white/70 p-[5px]",
  webSegments: "flex",
  segment: "flex-1 flex-row items-center justify-center gap-1.5 rounded-xl px-2 py-[11px]",
  segmentText: "text-[13.5px] font-extrabold",
  webSegment: "flex transition-colors",
  segmentActive: "bg-white",
  segmentActiveText: "text-primary",
  webSegmentActive: "shadow-[0_2px_8px_rgba(34,56,78,0.08)]",
  segmentIdleText: "text-muted-foreground",
  card: "flex-col items-center rounded-[26px] bg-white px-6 py-[26px]",
  webCard: "flex shadow-[0_4px_18px_rgba(34,56,78,0.06)]",
  cardStretch: "items-stretch",
  sentIcon: "size-16 items-center justify-center rounded-full bg-success-soft",
  webSentIcon: "flex text-success",
  sentTitle: "mt-3.5 text-xl font-extrabold text-ink",
  sentSub: "mt-2 max-w-[320px] text-sm font-semibold leading-relaxed text-muted-foreground",
  qrFrame: "rounded-[20px] border-2 border-border bg-white p-4",
  code: "mt-4 flex-row items-center gap-2 rounded-full bg-primary-soft px-4 py-2",
  codeText: "font-mono text-sm font-bold text-primary",
  webCode: "inline-flex transition-colors hover:bg-primary-soft-2",
  hint: "mt-4 max-w-[300px] text-[13.5px] font-semibold leading-relaxed text-muted-foreground",
  textAlign: "text-center",
  fieldLabel: "text-sm font-extrabold text-ink-2",
  tagLabel: "mb-2.5",
  nicknameLabel: "mb-1 mt-4",
  input: "rounded-2xl border-2 border-border-strong bg-muted px-4 text-center font-bold text-ink",
  webInput: "outline-none focus:border-primary focus:bg-white",
  /** The app's focused input (web: focus:). */
  inputFocused: "border-primary bg-white",
  tagInput: "py-3.5 font-mono text-[17px]",
  nicknameInput: "py-3 text-[15px]",
  tagHint: "self-center",
  error: "mt-2 text-[13.5px] font-bold text-danger",
  send: "mt-[18px] self-center",
  spaced: "mt-[18px]",
  scanAlt: "mt-4",
} as const;

/** The camera QR scanner (web: components/kid/friends/qr-scanner). */
export const qrScanner = {
  frame: "relative aspect-square w-full max-w-[260px] items-center justify-center overflow-hidden rounded-[22px]",
  webFrame: "flex bg-[radial-gradient(circle_at_50%_40%,#2c3f54,#1b2735)]",
  /** The app's flat fill for the web's radial gradient. */
  frameFill: "bg-ink-deep",
  corner: "absolute size-[30px] border-white/90",
  cornerTopLeft: "left-[18px] top-[18px] rounded-tl-[10px] border-l-[3.5px] border-t-[3.5px]",
  cornerTopRight: "right-[18px] top-[18px] rounded-tr-[10px] border-r-[3.5px] border-t-[3.5px]",
  cornerBottomLeft: "bottom-[18px] left-[18px] rounded-bl-[10px] border-b-[3.5px] border-l-[3.5px]",
  cornerBottomRight: "bottom-[18px] right-[18px] rounded-br-[10px] border-b-[3.5px] border-r-[3.5px]",
  hint: "absolute bottom-3 left-0 right-0 px-6",
  hintText: "text-[13px] font-bold text-white/90",
  webHint: "text-center [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]",
  error: "aspect-square w-full max-w-[260px] flex-col items-center justify-center gap-3 rounded-[22px] bg-muted px-6",
  webError: "flex text-center",
  errorText: "text-[13.5px] font-bold leading-relaxed text-muted-foreground",
} as const;

/** The QR code's ink and the dodi-head badge border (web: components/kid/friends/qr-code). */
export const qrCode = {
  ink: "#22384E",
  paper: "#FFFFFF",
  /** Quiet zone (margin) around the code, in modules: the QR spec asks for ≥4. */
  quiet: 4,
  /** The center badge, as a share of the code's size. */
  badge: 0.28,
  placeholder: "rounded-[14px] bg-muted",
  webPlaceholder: "inline-block",
} as const;
