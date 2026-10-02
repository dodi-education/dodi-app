/**
 * Recipes: the parent pages (/parent/kids, /kids/{id}, /kids/{id}/memory,
 * /personas, /activities, /usage). Same box / text / web split as
 * primitives.ts; values are the web's phone layout.
 */

// ----- Page and section messages ---------------------------------------------------

/** A whole-page loading / not-found line. */
export const pageMessage = {
  box: "items-center justify-center py-12",
  text: "text-muted-foreground",
  web: "flex",
} as const;

/** A section's loading / error line (`danger` for errors). */
export const sectionMessage = {
  box: "px-5 py-12",
  text: "text-center text-sm text-muted-foreground",
  danger: "text-danger",
} as const;

/** A section's empty state with an icon and an action. */
export const sectionEmpty = {
  box: "flex-col items-center gap-4 px-5 py-12",
  web: "flex",
  text: "text-sm text-muted-foreground",
  /** The icon (web: h-10 w-10 text-primary). */
  icon: { size: 40, color: "primary" },
  webIcon: "h-10 w-10 text-primary",
} as const;

/** A form's error line inside a Section. */
export const sectionFormError = {
  box: "px-5 py-3",
  text: "text-sm text-danger",
} as const;

// ----- Breadcrumbs -------------------------------------------------------------------------

/** The kid crumb's switcher button (web: a popover; the app opens a Sheet). */
export const kidCrumbSwitcher = {
  button: "size-7 items-center justify-center rounded-md",
  /** The app's button sits in the crumb row itself (web: in a shrink-0 wrapper). */
  shrink: "shrink-0",
  webButton: "flex text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-primary",
  open: "bg-foreground/5",
  webOpen: "text-primary",
} as const;

// ----- Avatars and row links -----------------------------------------------------------

/** A kid's initial circle (colors from kidAvatarColor). */
export const kidAvatar = {
  box: "size-[34px] shrink-0 items-center justify-center rounded-full",
  text: "text-[13px] font-bold",
  web: "flex",
} as const;

/** A friend approval's initial circle. */
export const approvalAvatar = {
  box: "size-[34px] shrink-0 items-center justify-center rounded-full bg-primary-soft",
  text: "text-[13px] font-bold text-primary",
  web: "flex",
} as const;

/** A persona's sparkles circle (icon in primary). */
export const personaAvatar = {
  box: "size-[34px] shrink-0 items-center justify-center rounded-full bg-primary-soft",
  web: "flex text-primary",
} as const;

/** The kids list: the row's link (avatar + text) next to its quick actions. */
export const kidRowLink = {
  box: "min-w-0 flex-1 flex-row items-center gap-3.5",
  web: "flex",
} as const;

/** Approve / reject, side by side at the end of an approval row. */
export const approvalActions = {
  box: "shrink-0 flex-row gap-2",
  web: "flex",
} as const;

// ----- Kid edit ---------------------------------------------------------------------------

/** The avatar-PIN puzzle block under its toggle. */
export const pinPuzzleBlock = {
  box: "px-5 py-4",
  hint: "mb-3 text-[13px] text-muted-foreground",
  puzzle: "max-w-[320px]",
} as const;

/** The friend code field with its Regenerate button. */
export const socialIdRow = {
  box: "flex-row items-center gap-2",
  web: "flex",
  /** The app stretches the row and the field (web: the field is sm:w-[250px]). */
  fill: "flex-1",
} as const;

// ----- Memory -----------------------------------------------------------------------------

/** The notes and dossier text areas. */
export const memoryTextarea = {
  box: "w-full rounded-md border border-input bg-card px-3 py-2",
  text: "font-mono text-[12.5px] leading-relaxed",
  web: "block resize-y outline-none transition-[color,box-shadow,border-color] placeholder:text-faint hover:border-faint focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary-soft-2",
  focused: "border-primary",
} as const;

/** "No memory yet" in place of the dossier. */
export const memoryEmpty = {
  box: "rounded-md bg-muted p-3.5",
  text: "text-sm leading-relaxed text-faint",
  web: "whitespace-pre-wrap",
} as const;

/** The read-only dossier with its numbered citations. */
export const dossierView = {
  box: "max-h-96 rounded-md bg-muted p-3.5",
  text: "text-sm leading-relaxed text-ink-2",
  web: "overflow-auto whitespace-pre-wrap",
  citation: "text-[10px] font-semibold leading-none text-primary",
  webCitation: "-my-1 mx-px cursor-pointer p-1 align-super hover:underline",
  /** The cited transcript turn (web: a popover under the citation). */
  popover: "mt-1 w-64 max-w-[80vw] rounded-md border border-border bg-card p-3 shadow-lg",
  webPopover: "absolute left-1/2 top-full z-10 block -translate-x-1/2 whitespace-normal",
  /** The popover's text size (the web sets it once on the popover). */
  popoverSize: "text-xs",
  popoverMeta: "font-medium text-faint",
  popoverText: "mt-1 leading-relaxed text-ink-2",
  popoverMissing: "text-faint",
  webBlock: "block",
} as const;

/** One structured memory (active or discarded). */
export const memoryItem = {
  box: "px-5 py-3",
  /** Active rows carry the Discard button beside the text. */
  withAction: "flex-row items-start justify-between gap-3",
  webWithAction: "flex",
  main: "min-w-0 flex-1",
  content: "text-sm text-ink-2",
  discardedContent: "text-sm text-muted-foreground line-through",
  meta: "mt-1 text-xs text-faint",
  /** The meta text alone (the app's discarded row puts it on each piece). */
  metaText: "text-xs text-faint",
  /** Discarded rows: badge, date and source on one wrapping line. */
  discardedMeta: "mt-1 flex-row flex-wrap items-center gap-2",
  webDiscardedMeta: "flex",
  category: "mr-2 font-medium",
  source: "font-mono text-[10px]",
  empty: "px-5 py-4",
  emptyText: "text-sm text-faint",
} as const;

// ----- Personas -----------------------------------------------------------------------------

/** A soul document, read-only (`tall` on the detail page, `short` as import preview). */
export const soulPreview = {
  box: "rounded-md bg-background p-3.5",
  text: "font-mono text-xs leading-relaxed text-ink-2",
  web: "overflow-auto whitespace-pre-wrap",
  tall: "max-h-96",
  short: "max-h-64",
} as const;

/** The soul document editor. */
export const soulTextarea = {
  box: "min-h-[320px] w-full rounded-md border border-border-strong bg-card px-3 py-2.5",
  text: "font-mono text-xs leading-relaxed",
  web: "resize-y transition-colors placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-soft-2 aria-invalid:border-destructive aria-invalid:ring-destructive/20",
  focused: "border-primary",
  invalid: "border-destructive",
} as const;

/** Import: the app's file button and the picked file's name (web: a file input). */
export const soulFile = {
  row: "min-w-0 flex-1 flex-row items-center gap-2",
  name: "min-w-0 flex-1 text-sm text-muted-foreground",
} as const;

/** Export + Clone beside the soul heading. */
export const soulActions = {
  box: "flex-row gap-2",
  web: "flex",
} as const;

// ----- Activities and usage ------------------------------------------------------------------

/** The filter row above the feed. */
export const activityFilters = {
  box: "mb-6 flex-row flex-wrap gap-3",
  web: "flex",
  trigger: "w-[180px]",
} as const;

/** "No activity yet" / "No results" outside a Section. */
export const activityEmpty = {
  box: "rounded-lg border border-dashed border-border-strong px-5 py-8",
  text: "text-center text-sm text-muted-foreground",
} as const;

/** A feed row's title (one line). */
export const activityRowTitle = {
  text: "font-medium",
  web: "line-clamp-1",
} as const;

/** The centered "Load more" under the feed. */
export const loadMoreRow = {
  box: "flex-row justify-center",
  web: "flex",
} as const;

/** The usage page's stat strip, framed as a card. */
export const usageStats = "mb-8 overflow-hidden rounded-lg border border-border bg-card shadow-card";
