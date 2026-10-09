/**
 * Games library recipes (see games.ts for the shared stage card): the parent's
 * games list and Discover (/parent/games), their dialogs (share, remix,
 * export, import, publish) and the read-only preview of a published game
 * (/parent/games/{id}). Same box / text / web split as primitives.ts; values
 * are the web's phone layout.
 */

// ----- Lists ------------------------------------------------------------------

/** One game in "Your games" or Discover. */
export const libraryRow = {
  box: "flex-row items-center gap-3 border-b border-border py-3 pl-3 pr-1",
  /** The app drops the last row's border itself (no `last:`). */
  last: "border-b-0",
  web: "flex last:border-0",
  /** "Your games": the row's link into the studio. */
  link: "min-w-0 flex-1 flex-row items-start gap-3 rounded-md",
  webLink: "group flex outline-none focus-visible:ring-2 focus-visible:ring-primary-soft-2",
  /** Discover: the row's button into the preview. */
  button: "-mx-1 min-w-0 flex-1 flex-row items-center gap-3 rounded-lg px-1 py-1",
  webButton:
    "flex text-left transition-colors outline-none hover:bg-card focus-visible:ring-2 focus-visible:ring-primary-soft-2",
  thumb: "h-15 w-15 shrink-0 rounded-xl",
  webThumb: "object-cover",
  /** Colored tag tile when there is no preview image (colors from tagStyle). */
  thumbFallback: "h-15 w-15 shrink-0 items-center justify-center rounded-xl",
  webThumbFallback: "flex",
  /** Discover avatars and accessories: the row's body (no preview page to open). */
  body: "min-w-0 flex-1 flex-row items-center gap-3",
  webBody: "flex",
  /** Their thumb without a preview image: the kind's icon on a soft tint. */
  thumbKind: "bg-primary-soft",
  webThumbKind: "text-primary",
  main: "min-w-0 flex-1",
  titleRow: "flex-row items-center gap-2",
  webTitleRow: "flex",
  title: "text-sm font-semibold text-ink-1",
  /** The app truncates with numberOfLines. */
  webTitle: "truncate",
  webTitleHover: "transition-colors group-hover:text-primary",
  meta: "mt-0.5 text-xs text-muted-foreground",
  webMeta: "truncate",
  /** Plays, copies and tag tiles. */
  stats: "mt-1 flex-row flex-wrap items-center gap-x-3 gap-y-1",
  statsText: "text-[11px] font-medium text-muted-foreground",
  webStats: "flex",
  stat: "flex-row items-center gap-1",
  webStat: "inline-flex",
  tagTile: "size-[18px] shrink-0 items-center justify-center rounded-md",
  webTagTile: "flex",
  /** The "…" actions button. */
  menuButton: "h-9 w-9 shrink-0 items-center justify-center rounded-md border border-transparent",
  menuButtonText: "text-ink-2",
  webMenuButton:
    "flex transition-colors outline-none hover:border-border-strong hover:bg-card focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary-soft-2 data-[state=open]:border-border-strong data-[state=open]:bg-card",
  /** Discover: the red trash that clears this family's share. */
  unshare: "size-9 shrink-0 items-center justify-center rounded-md bg-danger disabled:opacity-50",
  unshareText: "text-white",
  webUnshare:
    "flex transition-colors outline-none hover:bg-danger/90 focus-visible:ring-2 focus-visible:ring-danger/40 disabled:pointer-events-none",
} as const;

/**
 * A row's "…" actions on a phone: the app opens them in the bottom Sheet
 * (web: a DropdownMenu popover), one 44pt item per action.
 */
export const actionSheet = {
  item: "min-h-11 flex-row items-center gap-2 rounded-sm px-2 py-1.5",
  text: "text-sm font-medium text-foreground",
  destructiveText: "text-danger",
  separator: "-mx-1 my-1 h-px bg-border",
} as const;

/** Small status pills (Planning, Active, Inactive, Added). */
export const libraryPill = {
  box: "shrink-0 rounded-full px-2 py-0.5",
  text: "text-[11px] font-semibold",
  /** A pill with a leading dot or icon. */
  withIcon: "flex-row items-center gap-1.5",
  webWithIcon: "inline-flex",
  primary: "bg-primary-soft",
  primaryText: "text-primary",
  muted: "bg-foreground/5",
  mutedText: "text-muted-foreground",
  dot: "h-[7px] w-[7px] rounded-full bg-primary",
} as const;

/** Loading / empty line inside a list Section. */
export const libraryEmpty = "px-1 py-6 text-center text-sm text-muted-foreground";

/** Discover's "Load more" row. */
export const libraryLoadMore = { box: "flex-row justify-center pt-3", web: "flex" } as const;

// ----- Dialog content -----------------------------------------------------------

/** An inline error inside a dialog. */
export const formAlert = {
  box: "rounded-lg bg-danger-soft px-3 py-2",
  text: "text-xs font-medium text-danger",
  /** A confirmation question on the same tint (withdraw / unpublish). */
  confirmText: "text-xs text-ink-2",
} as const;

/** Small field label and hint inside a dialog. */
export const dialogField = {
  box: "flex-col gap-1.5",
  web: "flex",
  label: "text-xs font-semibold text-ink-2",
  hint: "text-[11px] text-faint",
  note: "text-xs text-muted-foreground",
} as const;

/** Family / kid audience pills (share and import dialogs). */
export const audiencePill = {
  row: "flex-row flex-wrap gap-2",
  webRow: "flex",
  box: "flex-row items-center gap-2 rounded-full border px-3 py-2",
  text: "text-sm font-semibold",
  web: "inline-flex transition-colors",
  selected: "border-primary bg-primary-soft",
  selectedText: "text-primary",
  idle: "border-border-strong bg-card",
  idleText: "text-ink-2",
  webIdle: "hover:border-faint",
  initial: "h-5 w-5 items-center justify-center rounded-full bg-primary-soft",
  initialText: "text-[11px] font-bold text-primary",
  webInitial: "flex",
} as const;

/** Export: the "include the conversation" switch row. */
export const exportOption = {
  group: "flex-col gap-2",
  webGroup: "flex",
  box: "flex-row items-center gap-2.5",
  text: "text-sm font-medium text-ink-2",
  web: "flex w-fit cursor-pointer",
} as const;

/** Import: the non-executing preview card of a parsed archive. */
export const importPreview = {
  /** Before a file is chosen: the pick button and its parse error. */
  picker: "flex-col gap-3",
  body: "flex-col gap-4",
  webBody: "flex",
  card: "flex-row gap-3 rounded-xl border border-border bg-card p-3",
  webCard: "flex",
  thumb: "h-18 w-18 shrink-0 rounded-lg",
  webThumb: "object-cover",
  main: "min-w-0 shrink",
  title: "text-sm font-bold text-ink",
  webTitle: "truncate",
  description: "mt-0.5 text-xs text-muted-foreground",
  webDescription: "line-clamp-3",
  meta: "mt-1 text-[11px] text-faint",
  tags: "mt-1.5 flex-row flex-wrap gap-1",
  webTags: "flex",
  tag: "flex-row items-center gap-1 rounded-full border border-border px-2 py-0.5",
  tagText: "text-[11px] font-semibold text-ink-2",
  webTag: "inline-flex",
  notes: "flex-col gap-1",
  notesText: "text-xs text-muted-foreground",
  webNotes: "flex",
  /** "Choose another file" text link. */
  another: "text-xs font-semibold text-muted-foreground underline",
  webAnother: "w-fit underline-offset-2 hover:text-ink-2",
} as const;

// ----- Publish ------------------------------------------------------------------

/** The publication state badge beside the publish dialog's title. */
export const publishBadge = {
  box: "rounded-full px-2 py-0.5",
  text: "text-[11px] font-semibold",
  published: "bg-primary-soft",
  publishedText: "text-primary",
  rejected: "bg-danger-soft",
  rejectedText: "text-danger",
  pending: "bg-warning-soft",
  pendingText: "text-warning",
} as const;

/** Submitted → Safety review → Live. */
export const publishStepper = {
  list: "flex-row items-start",
  webList: "flex",
  item: "relative flex-1 flex-col items-center gap-1.5",
  webItem: "flex text-center",
  line: "absolute right-1/2 h-0.5 w-full",
  /** The app sits the line on the dot's middle directly (no translate). */
  lineOffset: "top-[13px]",
  webLine: "top-3.5 -translate-y-1/2",
  lineDone: "bg-primary",
  lineUpcoming: "bg-muted",
  dot: "relative z-10 size-7 items-center justify-center rounded-full",
  dotText: "text-xs font-bold",
  webDot: "flex",
  done: "bg-primary",
  doneText: "text-primary-foreground",
  current: "bg-warning-soft",
  currentText: "text-warning",
  /** The app draws the ring as a border (no box-shadow rings). */
  currentRing: "border-2 border-warning",
  webCurrentRing: "ring-2 ring-warning",
  danger: "bg-danger-soft",
  dangerText: "text-danger",
  dangerRing: "border-2 border-danger",
  webDangerRing: "ring-2 ring-danger",
  upcoming: "bg-muted",
  upcomingText: "text-faint",
  label: "text-[11px] font-semibold",
  labelDone: "text-ink-2",
  labelUpcoming: "text-faint",
} as const;

/** The publish dialog's Withdraw / Unpublish (a ghost button in danger red). */
export const publishWithdraw = {
  text: "text-danger",
  web: "hover:bg-danger-soft hover:text-danger sm:mr-auto",
} as const;

/** Tinted callouts in the publish dialog (live, in review, warnings, info). */
export const publishCallout = {
  /** The status view's column. */
  stack: "flex-col gap-3",
  webStack: "flex",
  box: "flex-row gap-2.5 rounded-lg px-3 py-2.5",
  text: "text-xs",
  web: "flex",
  /** The tighter variant (warnings, edited-since hints). */
  compact: "flex-row gap-2 rounded-lg px-3 py-2",
  success: "bg-success-soft",
  warning: "bg-warning-soft",
  info: "bg-muted",
  body: "flex-col gap-2",
  bodyTight: "flex-col gap-1",
  webBody: "flex",
  bodyText: "text-ink-2",
  link: "flex-row items-center gap-1",
  linkText: "font-semibold text-primary",
  webLink: "inline-flex hover:underline",
} as const;

/** The status view's "send a newer version" disclosure. */
export const publishDisclosure = {
  root: "rounded-lg border border-border px-3",
  webRoot: "group",
  summary: "min-h-11 flex-row items-center gap-1.5",
  summaryText: "text-xs font-semibold text-ink-2",
  webSummary: "flex cursor-pointer list-none [&::-webkit-details-marker]:hidden",
  body: "flex-col items-start gap-2.5 pb-3",
  webBody: "flex",
} as const;

/** One review finding (hard rejections danger, soft ones warning). */
export const rejectionReason = {
  list: "flex-col gap-2",
  webList: "flex",
  box: "rounded-lg px-3 py-2",
  text: "text-xs",
  permanent: "bg-danger-soft",
  fixable: "bg-warning-soft",
  title: "font-semibold",
  titlePermanent: "text-danger",
  titleFixable: "text-warning",
  note: "mt-0.5 text-muted-foreground",
} as const;

/** The translate-then-review stage: every locale's listing title + description. */
export const translationsReview = {
  root: "flex-col gap-3",
  webRoot: "flex max-h-[50vh] overflow-y-auto",
  field: "flex-col gap-1.5",
  webField: "flex",
  locale: "text-xs font-semibold uppercase text-ink-2",
  sourceTag: "ml-1.5 normal-case text-faint",
  textarea: "w-full rounded-md border border-border bg-transparent px-3 py-2",
  textareaText: "text-sm",
  webTextarea:
    "shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50",
  flagged: "border-warning",
  /** The app's two-row height (web: rows={2}). */
  textareaHeight: "min-h-16",
} as const;

/** Two small number inputs, "min – max". */
export const ageRange = {
  row: "flex-row items-center gap-2.5",
  webRow: "flex",
  field: "w-16 text-center",
  invalid: "border-destructive",
  dash: "text-sm font-medium text-muted-foreground",
} as const;

// ----- Preview of a published game ------------------------------------------------

export const gamePreview = {
  /** Tab switch + Share, above the stage. */
  header: "flex-row flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-2.5",
  webHeader: "flex flex-shrink-0 md:px-5",
  segments: "flex-row gap-0.5 rounded-[10px] border border-border bg-background p-[3px]",
  webSegments: "inline-flex",
  segment: "flex-row items-center gap-1.5 rounded-[7px] px-3.5 py-[7px]",
  segmentText: "text-[13px] font-semibold",
  webSegment: "inline-flex transition-colors",
  segmentActive: "bg-card",
  segmentActiveText: "text-ink",
  webSegmentActive: "shadow-[0_1px_2px_rgba(34,56,78,0.06)]",
  segmentIdleText: "text-muted-foreground",
  webSegmentIdle: "hover:text-ink-2",
  headerActions: "flex-row items-center gap-2.5",
  webHeaderActions: "flex",
  stage: "items-center justify-center p-5",
  webStage: "flex min-h-full md:p-8",
  infos: "mx-auto max-w-[560px] flex-col gap-6 p-5",
  webInfos: "flex md:p-8",
  infoRow: "flex-col gap-1.5",
  webInfoRow: "flex",
  infoLabel: "text-xs font-semibold text-ink-2",
  infoText: "text-sm text-ink",
  infoLongText: "leading-relaxed",
  infoEmpty: "text-sm text-muted-foreground",
  tags: "flex-row flex-wrap gap-2",
  webTags: "flex",
  tagChip: "flex-row items-center gap-1.5 rounded-full px-2.5 py-1",
  tagChipText: "text-[12px] font-semibold",
  webTagChip: "inline-flex",
} as const;
