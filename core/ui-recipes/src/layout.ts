/**
 * Page and shell layout styles shared by the web and the mobile app: the
 * parent shell (top bar, drawer, nav), settings tabs, sections and rows. Same
 * box / text / web split as primitives.ts. Values are the web's compact
 * (phone) layout; `web` carries the wide-screen and hover extras.
 */

// ----- Parent shell -----------------------------------------------------------

/** Height of the compact top bar content (the studio overlay sits below it). */
export const PARENT_TOP_BAR_HEIGHT = 60;

export const topBar = {
  root: "border-b border-border bg-sidebar px-4 py-3",
  row: "min-h-9 flex-row items-center justify-between gap-3",
  left: "min-w-0 flex-1 flex-row items-center gap-2",
  menuButton: "-ml-1.5 size-9 shrink-0 items-center justify-center rounded-md",
  menuIcon: { size: 22, stroke: 2, colorClass: "text-ink-2" },
} as const;

export const breadcrumbs = {
  row: "min-w-0 flex-1 flex-row items-center gap-1",
  text: "text-[22px] tracking-tight",
  link: "font-medium text-muted-foreground",
  current: "font-semibold text-ink",
  separatorIcon: { size: 18, colorClass: "text-faint" },
} as const;

export const kidViewButton = {
  box: "flex-row items-center gap-1.5 rounded-md border border-border-strong bg-card px-2 py-1.5",
  text: "text-xs font-semibold text-foreground",
  icon: { size: 14 },
} as const;

export const drawer = {
  backdrop: "bg-foreground/40",
  /** Width in px; capped at 84% of the screen. */
  width: 274,
  maxWidthRatio: 0.84,
  panel: "border-r border-border bg-sidebar px-3 pt-5 pb-4",
  header: "flex-row items-center px-2.5 pb-4",
  brand: "flex-row items-center gap-2.5 rounded-md",
  headerActions: "ml-auto flex-row items-center gap-1",
  headerButton: "size-9 items-center justify-center rounded-md",
  headerIcon: { size: 18, stroke: 2, colorClass: "text-muted-foreground" },
  footer: "mt-auto gap-2.5 pt-3",
} as const;

export const navGroupLabel = {
  text: "px-2.5 pb-1.5 text-[11px] font-bold tracking-[0.07em] text-faint uppercase",
  first: "pt-1",
  rest: "pt-4",
} as const;

export const navItem = {
  box: "flex-row items-center gap-2.5 rounded-md px-2.5 py-2",
  boxActive: "bg-primary-soft",
  text: "text-sm",
  textActive: "font-semibold text-primary",
  textInactive: "font-medium text-ink-2",
  icon: { size: 17 },
  web: "flex transition-colors",
  webInactive: "hover:bg-foreground/5",
} as const;

export const accountBadge = {
  row: "flex-row items-center gap-2 border-t border-border pt-2.5",
  avatar: "size-7 shrink-0 items-center justify-center rounded-full bg-primary-soft-2",
  avatarText: "text-xs font-bold text-primary",
  email: "text-[12.5px] font-semibold text-foreground",
  tier: "text-[11.5px] text-muted-foreground",
  signOut: "rounded p-1",
  signOutIcon: { size: 15, colorClass: "text-faint" },
} as const;

/** Content column inside the shell (phone values). */
export const shellContent = "max-w-[880px] px-4 py-5 pb-[72px]";

// ----- Settings -----------------------------------------------------------------

export const backLink = {
  box: "mb-3 flex-row items-center gap-1.5 self-start",
  text: "text-[13px] font-semibold text-muted-foreground",
  icon: { size: 14, stroke: 2.2 },
  web: "inline-flex transition-colors hover:text-primary",
} as const;

export const settingsTab = {
  strip: "-mx-4 flex-row gap-1.5 px-4 pb-1",
  box: "shrink-0 rounded-md px-3 py-1.5",
  boxActive: "bg-primary-soft",
  text: "text-[13px]",
  textActive: "font-semibold text-primary",
  textInactive: "font-medium text-ink-2",
  web: "whitespace-nowrap transition-colors",
} as const;

// ----- Sections and rows ------------------------------------------------------------

export const section = {
  root: "mb-8",
  head: "mb-2.5 flex-row items-end justify-between gap-4",
  title: "text-base font-semibold tracking-tight text-foreground",
  description: "mt-0.5 text-[13px] text-muted-foreground",
  card: "overflow-hidden rounded-lg border border-border bg-card shadow-card",
  /** Between consecutive children (web: [&>*+*]:border-t). */
  divider: "border-t border-border",
  web: "[&>*+*]:border-t [&>*+*]:border-border",
} as const;

export const pageActions = "flex-row items-center justify-end gap-2";

export const row = {
  box: "flex-row items-center gap-3.5 px-5 py-3.5",
  main: "min-w-0 flex-1",
  title: "flex-row items-center gap-2",
  titleText: "text-sm font-semibold text-foreground",
  meta: "mt-0.5 text-[12.5px] text-muted-foreground",
  dot: "mx-1.5 text-border-strong",
  web: "flex",
  webClickable: "transition-colors hover:bg-[#FAFCFE]",
} as const;

/** Settings row: label above the control on phones (web: side by side from sm). */
export const fieldRow = {
  box: "flex-col gap-2 px-5 py-3.5",
  label: "text-sm font-medium text-foreground",
  hint: "mt-0.5 text-[12.5px] text-muted-foreground",
  control: "flex-row items-center gap-2",
  web: "flex sm:flex-row sm:items-center sm:justify-between sm:gap-6",
  webControl: "flex sm:shrink-0",
} as const;

export const requiredMark = "ml-0.5 text-destructive/70";

export const stackField = "px-5 py-3.5 pb-4";

export const saveRow = {
  box: "flex-row items-center justify-end gap-2.5 px-5 py-3.5",
  note: "mr-auto text-[12.5px] text-success",
  web: "flex",
} as const;

/** A radio option as a card (label + hint), in a vertical group. */
export const radioCard = {
  group: "flex-col gap-2.5 px-5 py-4",
  webGroup: "flex",
  box: "flex-row items-start gap-3 rounded-lg border px-4 py-3",
  boxSelected: "border-primary bg-primary-soft",
  boxIdle: "border-border-strong bg-card",
  web: "flex text-left transition-colors",
  webIdle: "hover:border-faint",
  dot: "mt-0.5 h-4 w-4 shrink-0 items-center justify-center rounded-full border",
  dotSelected: "border-primary bg-primary text-white",
  dotIdle: "border-border-strong",
  webDot: "flex",
  dotIconSize: 11,
  body: "flex-col gap-0.5",
  webBody: "flex",
  label: "text-sm font-semibold",
  labelSelected: "text-primary",
  labelIdle: "text-ink-2",
  hint: "text-[12.5px] text-muted-foreground",
} as const;

// ----- Auth -----------------------------------------------------------------------

export const authLayout = {
  root: "flex-1 items-center justify-center px-4 py-12",
  logo: "mb-8 flex-row items-center gap-2",
  logoHeadSize: 48,
  logoText: "text-2xl font-bold text-dodi-800",
  container: "w-full max-w-md",
  /** Privacy policy, terms and imprint under the card, before anyone signs in. */
  legal: "mt-6 flex-row flex-wrap items-center justify-center gap-x-4 gap-y-1",
  legalLink: "text-xs text-muted-foreground",
  webLegalLink: "hover:underline",
} as const;

/** The page background (web: body). */
export const pageGradient = {
  colors: ["#EAF2FB", "#F2F8FD", "#FFFFFF"],
  locations: [0, 0.7, 1],
} as const;

// ----- Kid avatars --------------------------------------------------------------

/** The cycling avatar colors for kids (initial circles), by list position. */
export const kidAvatarPalette = [
  { bg: "bg-primary-soft-2", fg: "text-primary" },
  { bg: "bg-success-soft", fg: "text-success" },
  { bg: "bg-violet-soft", fg: "text-violet" },
  { bg: "bg-amber-soft", fg: "text-amber" },
] as const;

export function kidAvatarColor(index: number): (typeof kidAvatarPalette)[number] {
  const n = kidAvatarPalette.length;
  return kidAvatarPalette[((index % n) + n) % n];
}
