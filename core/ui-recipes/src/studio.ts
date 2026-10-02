/**
 * Game Studio recipes (see games.ts for the shared stage card). Values are the
 * web studio's phone (`vertical`) layout, same box / text / web split as
 * primitives.ts. Keys without a `web` prefix that the web never joins
 * (`disabled`, `focused`, …) are the app's stand-ins for browser states.
 */

// ----- Frame ----------------------------------------------------------------------

/** The studio layer under the parent top bar; the two panes inside it. */
export const studioFrame = {
  root: "flex-col border-t border-border bg-background",
  webRoot: "fixed inset-x-0 top-[60px] bottom-0 z-30 flex wide:top-[72px] wide:left-56",
  panes: "min-h-0 flex-1 overflow-hidden",
  panesVertical: "flex-col",
  webPanes: "flex",
  webPanesSide: "flex-row",
  main: "min-h-0 min-w-0 flex-1 flex-col bg-background",
  webMain: "flex",
  chat: "relative min-h-0 flex-col border-border bg-card",
  chatVertical: "w-full flex-1",
  webChat: "flex",
  webChatSide: "flex-none border-l",
} as const;

/** The Game / dodi switch above the panes (vertical layout only). */
export const studioTabBar = {
  box: "flex-row flex-shrink-0 gap-1 border-b border-border bg-card px-3 py-2",
  web: "flex",
} as const;

export const studioTab = {
  box: "flex-1 flex-row items-center justify-center gap-1.5 rounded-[9px] border px-2.5 py-2",
  text: "text-[13.5px] font-semibold",
  web: "inline-flex transition-colors",
  active: "border-primary-soft-2 bg-primary-soft",
  activeText: "text-primary",
  idle: "border-border bg-background",
  idleText: "text-muted-foreground",
  icon: { size: 15 },
} as const;

// ----- Stage ----------------------------------------------------------------------

/** The stage's header row: the view switch, the preview language, the active toggle. */
export const stageHeader = {
  box: "flex-row flex-shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-2.5",
  web: "flex md:px-5",
  right: "flex-row items-center gap-2.5",
  webRight: "flex",
} as const;

/** A segmented switch: Plan / Settings / Code / Preview, and the preview language. */
export const studioSeg = {
  group: "flex-row gap-0.5 rounded-[10px] border border-border bg-background p-[3px]",
  webGroup: "inline-flex",
  box: "flex-row items-center gap-1.5 rounded-[7px] px-3.5 py-[7px]",
  text: "text-[13px] font-semibold",
  web: "inline-flex transition-colors",
  active: "bg-card",
  activeText: "text-ink",
  webActive: "shadow-[0_1px_2px_rgba(34,56,78,0.06)]",
  idleText: "text-muted-foreground",
  webIdle: "hover:text-ink-2",
  icon: { size: 15 },
} as const;

export const previewLocale = {
  box: "rounded-[8px] px-2 py-1",
  text: "text-[11px] font-semibold uppercase",
  web: "transition-colors",
  active: "bg-card",
  activeText: "text-foreground",
  webActive: "shadow-sm",
  idleText: "text-muted-foreground",
  webIdle: "hover:text-foreground",
} as const;

/** The header's auto-saving active / inactive switch. */
export const activeToggle = {
  box: "flex-row items-center gap-2 rounded-full border px-2.5 py-1",
  text: "text-[11px] font-semibold",
  web: "inline-flex transition-colors disabled:cursor-not-allowed disabled:opacity-60",
  disabled: "opacity-60",
  on: "border-primary-soft-2 bg-primary-soft",
  onText: "text-primary",
  off: "border-border-strong bg-card",
  offText: "text-muted-foreground",
  webOff: "hover:border-faint",
  track: "relative h-4 w-[27px] shrink-0 flex-row items-center rounded-full",
  webTrack: "inline-flex transition-colors",
  trackOn: "bg-primary",
  trackOff: "bg-border-strong",
  thumb: "h-3 w-3 rounded-full bg-white",
  webThumb: "inline-block shadow-sm transition-transform",
  thumbOn: "translate-x-[13px]",
  thumbOff: "translate-x-[2px]",
} as const;

export const stageBody = {
  box: "relative min-h-0 min-w-0 flex-1",
  web: "overflow-y-auto",
  /** The preview (and its empty state), centered. */
  center: "min-h-full items-center justify-center p-5",
  webCenter: "flex md:p-8",
  /** The code tab's empty state. */
  centerCode: "min-h-full items-center justify-center p-8",
  webCenterCode: "flex",
} as const;

export const emptyStage = {
  box: "m-auto max-w-[280px]",
  text: "text-center",
  iconBox: "mx-auto mb-3.5 h-14 w-14 items-center justify-center rounded-2xl border border-border bg-card",
  webIconBox: "flex text-faint",
  icon: { size: 28 },
  title: "text-[13px] leading-relaxed text-muted-foreground",
} as const;

// ----- Chat pane ------------------------------------------------------------------

export const chatHeader = {
  box: "flex-row flex-shrink-0 items-center gap-3 border-b border-border px-4 py-3",
  web: "flex",
  avatar: "h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-soft p-0.5",
  webAvatar: "flex",
  avatarImage: "h-full w-full",
  webAvatarImage: "object-contain",
  info: "min-w-0 flex-1",
  name: "text-sm font-bold text-ink",
  status: "mt-0.5 flex-row items-center gap-1.5",
  statusText: "text-xs text-muted-foreground",
  webStatus: "flex",
  webStatusLabel: "truncate",
  dot: "h-[7px] w-[7px] rounded-full",
  webDot: "inline-block",
  dotBusy: "bg-primary",
  webDotBusy: "animate-pulse",
  dotIdle: "bg-success",
  clear: "ml-auto h-8 w-8 shrink-0 items-center justify-center rounded-lg",
  webClear:
    "flex text-muted-foreground transition-colors hover:bg-danger-soft hover:text-danger disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground",
  clearDisabled: "opacity-40",
  clearIcon: { size: 16 },
} as const;

export const chatThread = {
  box: "min-h-0 flex-1",
  web: "overflow-y-auto",
  inner: "flex-col gap-[18px] px-[18px] pb-1.5 pt-[18px]",
  webInner: "flex",
} as const;

/** The empty thread: dodi, a welcome line and the starters. */
export const chatWelcome = {
  box: "flex-col items-center px-1",
  text: "text-center",
  web: "flex",
  plan: "pb-2 pt-3",
  idle: "pb-2 pt-6",
  image: "mb-3 h-14 w-14",
  webImage: "object-contain",
  title: "text-[18px] font-bold tracking-tight text-ink",
  description: "mt-1.5 text-[13px] leading-relaxed text-muted-foreground",
  list: "mt-[18px] w-full flex-col gap-2",
  webList: "flex",
} as const;

/** A full-width choice with an icon: the starters, the Plan step's empty state, the image sheet. */
export const studioActionRow = {
  box: "flex-row items-center gap-2.5 rounded-lg border border-border bg-card px-3.5 py-[11px]",
  text: "text-left text-[13.5px] font-medium text-ink-2",
  web: "flex transition-colors hover:border-primary hover:bg-primary-soft hover:text-primary",
  webDisableable:
    "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border disabled:hover:bg-card disabled:hover:text-ink-2",
  disabled: "opacity-50",
  icon: { size: 14 },
} as const;

export const chatMessage = {
  row: "flex-row items-start gap-3",
  webRow: "flex",
  avatar: "-mt-px h-[30px] w-[30px] shrink-0",
  webAvatar: "object-contain",
  body: "min-w-0 flex-1",
  bodyText: "text-sm leading-[1.6] text-ink",
  userRow: "flex-row justify-end",
  webUserRow: "flex",
  bubble: "max-w-[88%] rounded-2xl rounded-tr-[5px] bg-primary-soft px-3.5 py-2.5",
  bubbleText: "text-sm font-medium leading-[1.6] text-ink",
  images: "mb-2 flex-row flex-wrap gap-1.5",
  webImages: "flex",
  image: "h-16 w-16 rounded-lg border border-border",
  webImage: "object-cover",
  links: "mt-1.5 flex-row items-center gap-1.5",
  linksText: "text-[11.5px] font-medium text-faint",
  webLinks: "flex",
  webLink: "underline-offset-2 transition-colors hover:text-primary hover:underline",
  webLinkDisableable:
    "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:text-faint disabled:hover:no-underline",
  linkDisabled: "opacity-50",
} as const;

/** dodi at work: the bouncing dots, the live narration, the write progress. */
export const chatThinking = {
  dots: "flex-row gap-1.5 py-1.5",
  webDots: "flex",
  dot: "h-[7px] w-[7px] rounded-full bg-faint",
  webDot: "animate-bounce",
  webDotDelays: ["[animation-delay:0ms]", "[animation-delay:150ms]", "[animation-delay:300ms]"],
  narration: "mt-1 text-[12.5px] italic leading-relaxed text-muted-foreground",
  webNarration: "whitespace-pre-wrap",
  writeProgress: "mt-1 text-[11.5px] font-medium tabular-nums text-faint",
} as const;

// ----- Composer -------------------------------------------------------------------

export const composer = {
  box: "flex-shrink-0 px-4 pb-3.5 pt-2",
  card: "relative rounded-2xl border border-border-strong bg-card px-4 pb-2.5 pt-3",
  webCard: "shadow-[0_4px_18px_rgba(34,56,78,0.07)] transition-colors focus-within:border-primary",
  cardFocused: "border-primary",
  pending: "mb-2 flex-row flex-wrap gap-2",
  webPending: "flex",
  pendingImage: "h-12 w-12 rounded-lg border border-border",
  webPendingImage: "object-cover",
  remove: "absolute -right-1.5 -top-1.5 h-5 w-5 items-center justify-center rounded-full bg-ink",
  webRemove: "flex text-white transition-colors hover:bg-danger",
  input: "w-full border-0 bg-transparent p-0 pb-1.5",
  inputText: "text-[14.5px] leading-normal text-ink",
  webInput: "block resize-none outline-none placeholder:text-faint disabled:cursor-not-allowed",
  actions: "flex-row items-center justify-between",
  webActions: "flex",
  attach: "h-9 w-9 shrink-0 items-center justify-center rounded-full",
  webAttach:
    "flex text-muted-foreground transition-colors hover:bg-primary-soft hover:text-primary disabled:cursor-not-allowed disabled:opacity-40",
  attachDisabled: "opacity-40",
  send: "h-9 w-9 shrink-0 items-center justify-center rounded-full",
  webSend: "flex text-white transition-colors active:scale-95",
  sendOn: "bg-primary",
  webSendOn: "hover:bg-primary-hover",
  sendOff: "bg-border-strong",
  footer: "mt-2 text-center text-[11px] leading-snug text-faint",
} as const;

/** The lines above the composer: warnings, the running-build hint, resume, errors. */
export const composerNotice = {
  box: "mb-2 flex-row items-start gap-1.5 rounded-lg px-2.5 py-1.5",
  text: "text-xs font-medium",
  web: "flex",
  warning: "bg-warning-soft",
  warningText: "text-warning",
  primary: "bg-primary-soft",
  primaryText: "text-primary",
  resume: "mb-2 flex-row flex-wrap items-center gap-2 rounded-lg bg-primary-soft px-2.5 py-1.5",
  resumeText: "text-xs font-medium text-primary",
  resumeLabel: "min-w-0 flex-1",
  error: "mb-2 rounded-lg bg-danger-soft px-2.5 py-1.5",
  errorText: "text-xs font-medium text-danger",
  link: "font-semibold underline",
  webLink: "underline-offset-2 hover:opacity-80",
} as const;

// ----- Plan step --------------------------------------------------------------------

/** A Plan surface (sketch, plan) over the thread: its column and title row. */
export const planSurface = {
  root: "min-h-0 flex-1 flex-col",
  webRoot: "flex",
  header: "flex-row shrink-0 items-center gap-2 border-b border-border px-2 py-2",
  webHeader: "flex",
  back: "h-11 w-11 shrink-0 items-center justify-center rounded-lg",
  webBack: "flex text-muted-foreground transition-colors hover:bg-primary-soft hover:text-primary",
  title: "min-w-0 flex-1 text-[15px] font-bold text-ink",
  webTitle: "truncate",
  body: "min-h-0 flex-1",
  /** The app puts the padding on the scroll content. */
  bodyPadding: "px-4 py-3",
  webBody: "overflow-y-auto",
  column: "mx-auto w-full max-w-2xl flex-col gap-4",
  webColumn: "flex",
  sketchArea: "min-h-0 flex-1 items-center justify-center p-2",
  webSketchArea: "flex [container-type:size]",
} as const;

/** The plan on the table (the phone's surface layout). */
export const planCard = {
  section: "flex-col gap-2.5",
  webSection: "flex",
  empty: "text-[12.5px] leading-relaxed text-muted-foreground",
  editor: "w-full rounded-lg border border-border-strong bg-background p-3",
  editorText: "text-[13px] leading-relaxed text-ink",
  webEditor: "resize-y outline-none focus:border-primary",
  editorFocused: "border-primary",
  bodyText: "text-[13px] leading-[1.6] text-ink",
  personalize: "w-full flex-row items-center gap-2 rounded-lg border border-border bg-background px-3 py-2",
  personalizeText: "text-left text-[12.5px] font-medium text-ink-2",
  webPersonalize:
    "flex transition-colors hover:border-primary hover:bg-primary-soft hover:text-primary disabled:cursor-not-allowed disabled:opacity-50",
  personalizeDisabled: "opacity-50",
  actions: "flex-col gap-2 border-t border-border pt-4",
  webActions: "flex",
} as const;

/** The composer's image sheet: camera, file, sketch. */
export const referenceSheet = {
  list: "flex-col gap-2",
  webList: "flex",
} as const;

/** The Plan step's pinned controls once the conversation has started. */
export const planActionBar = {
  box: "shrink-0 border-b border-border bg-card",
  content: "flex-row items-center gap-2 px-3 py-2",
  web: "flex overflow-x-auto",
} as const;

export const planPill = {
  box: "shrink-0 flex-row items-center gap-1.5 rounded-[9px] border px-3 py-2",
  text: "text-[13px] font-semibold",
  web: "inline-flex transition-colors disabled:cursor-not-allowed disabled:opacity-50",
  disabled: "opacity-50",
  on: "border-primary-soft-2 bg-primary-soft",
  onText: "text-primary",
  off: "border-border bg-background",
  offText: "text-muted-foreground",
  icon: { size: 15 },
} as const;

/** The freehand sketch pad: a white card, the tool row, the 4:5 canvas. */
export const sketchPad = {
  card: "flex-col overflow-hidden rounded-[18px] border border-border bg-white",
  webCard: "flex shadow-[0_8px_28px_rgba(34,56,78,0.10)]",
  /** Height of the tool row in px (callers sizing the pad subtract it). */
  toolbarHeight: 56,
  toolbar: "shrink-0 border-b border-border",
  /** The row inside (the app scrolls it sideways). */
  toolbarContent: "flex-row items-center gap-3 px-3",
  webToolbar: "flex overflow-x-auto",
  group: "flex-row items-center gap-1",
  webGroup: "flex",
  groupEnd: "ml-auto flex-row items-center gap-1",
  swatchButton: "h-9 w-9 shrink-0 items-center justify-center rounded-full",
  webSwatchButton: "flex",
  swatch: "h-6 w-6 rounded-full border border-black/10",
  webSwatch: "transition-transform",
  swatchSelected: "scale-110",
  webSwatchSelected: "ring-2 ring-primary ring-offset-2 ring-offset-white",
  /** The app draws the selection ring as a border around the swatch. */
  swatchRing: "rounded-full border-2 border-primary p-[2px]",
  swatchRingIdle: "rounded-full border-2 border-transparent p-[2px]",
  tool: "h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border",
  webTool: "flex transition-colors disabled:cursor-not-allowed disabled:opacity-40",
  toolDisabled: "opacity-40",
  toolOn: "border-primary bg-primary-soft",
  webToolOn: "text-primary",
  toolOff: "border-border bg-card",
  webToolOff: "text-muted-foreground hover:border-faint hover:text-ink",
  webToolDanger: "hover:border-danger hover:text-danger",
  toolIcon: { size: 17 },
  penDot: "rounded-full",
  canvas: "w-full bg-white",
  webCanvas: "block cursor-crosshair",
} as const;

// ----- Settings -------------------------------------------------------------------

export const studioSettings = {
  form: "mx-auto max-w-[560px] flex-col gap-4 p-5",
  webForm: "flex md:p-8",
  field: "flex-col gap-1.5",
  webField: "flex",
  labelRow: "flex-row items-center gap-2",
  webLabelRow: "flex",
  label: "text-xs font-semibold text-ink-2",
  hint: "text-[11px] text-faint",
  error: "text-[11px] font-medium text-danger",
  chips: "flex-row flex-wrap gap-2",
  webChips: "flex",
  chipsInvalid: "-m-2 rounded-lg border border-destructive p-2",
  webChipsInvalid: "ring-2 ring-destructive/20",
  switchRow: "flex-row items-center gap-2.5 self-start",
  switchText: "text-sm font-medium text-ink-2",
  webSwitchRow: "flex w-fit cursor-pointer",
  stack: "flex-col gap-2",
  webStack: "flex",
  note: "text-xs text-muted-foreground",
  link: "font-semibold underline",
  webLink: "underline-offset-2 hover:opacity-80",
  save: "mt-2 flex-col gap-3 border-t border-border pt-6",
  webSave: "flex",
  saveError: "rounded-lg bg-danger-soft px-3 py-2",
  saveErrorText: "text-xs font-medium text-danger",
} as const;

/** A selectable option chip: perspective, tags (the audience uses `audiencePill`). */
export const optionChip = {
  box: "flex-row items-center gap-1.5 rounded-full border px-3 py-1.5",
  text: "text-sm font-semibold",
  web: "inline-flex transition-colors",
  selected: "border-primary bg-primary-soft",
  selectedText: "text-primary",
  idle: "border-border-strong bg-card",
  idleText: "text-ink-2",
  webIdle: "hover:border-faint",
} as const;

/** Multi-line settings fields (learning goal, success definition). */
export const studioTextarea = {
  box: "w-full rounded-md border border-border-strong bg-card px-3 py-2",
  text: "text-sm",
  web: "resize-y placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-soft-2",
  webInvalid: "aria-invalid:border-destructive aria-invalid:ring-destructive/20",
  goal: "min-h-[76px]",
  success: "min-h-[72px]",
  focused: "border-primary",
  invalid: "border-destructive",
} as const;

/** Settings: the Discover listing text per language (made when first published). */
export const listingTranslations = {
  root: "flex-col gap-1.5",
  webRoot: "flex scroll-mt-4",
  list: "mt-1 flex-col gap-3",
  webList: "flex",
  card: "flex-col gap-1.5 rounded-lg border border-border bg-card p-3",
  webCard: "flex",
  gameLanguage: "ml-1.5 font-normal text-faint",
  flagged: "border-warning",
} as const;

export const tagPicker = {
  box: "flex-row flex-wrap items-center gap-2",
  web: "flex",
  none: "text-sm text-muted-foreground",
} as const;

// ----- Agent run log ----------------------------------------------------------------

export const agentRun = {
  /** "How dodi built this" disclosure. */
  root: "mt-1",
  webRoot: "group",
  summary: "min-h-11 flex-row items-center gap-1.5 rounded-md",
  summaryText: "text-[12px] font-medium text-faint",
  webSummary:
    "hover:text-primary focus-visible:ring-ring flex cursor-pointer list-none transition-colors focus-visible:ring-2 focus-visible:outline-none motion-reduce:transition-none [&::-webkit-details-marker]:hidden",
  summaryMeta: "text-[11.5px] font-normal",
  summaryChevron: "text-[13px]",
  webSummaryChevron: "transition-transform group-open:rotate-90 motion-reduce:transition-none",
  empty: "text-faint text-[11.5px] italic",
  /** The timeline. */
  list: "border-border mt-1.5 border-l pl-3",
  webList: "space-y-2",
  /** The app spaces the entries with a gap (the web: space-y-2). */
  listGap: "gap-2",
  item: "relative flex-row gap-2",
  webItem: "flex",
  dot: "bg-border absolute top-[7px] -left-[16.5px] h-[7px] w-[7px] rounded-full",
  time: "text-faint w-9 shrink-0 pt-px text-[11px] tabular-nums",
  content: "min-w-0 flex-1",
  step: "text-ink-2 text-[12.5px] font-semibold",
  narration: "text-muted-foreground text-[12.5px] leading-relaxed italic",
  webNarration: "whitespace-pre-wrap",
} as const;

/** One screenshot check on the timeline. */
export const agentRunCheck = {
  title: "flex-row items-center gap-1.5",
  titleText: "text-ink-2 text-[12.5px] font-semibold",
  webTitle: "flex",
  status: "text-[11.5px] font-medium",
  statusBad: "text-destructive",
  statusGood: "text-success",
  requested: "text-faint mt-0.5 text-[11.5px]",
  failed: "text-muted-foreground mt-0.5 text-[11.5px]",
  noFrames: "text-faint mt-0.5 text-[11.5px] italic",
  issues: "mt-1.5",
  issuesTitle: "text-[11.5px] font-semibold",
  issuesDanger: "text-destructive",
  issuesWarning: "text-warning",
  issuesMuted: "text-muted-foreground",
  issueList: "mt-0.5 pl-4",
  issueText: "text-muted-foreground text-[11.5px] leading-snug",
  webIssueList: "list-disc space-y-0.5",
  webIssue: "break-words",
} as const;

/** The frames a screenshot check captured, as thumbnails. */
export const agentRunFrames = {
  list: "mt-1.5 flex-row flex-wrap gap-2",
  webList: "flex",
  item: "w-[76px]",
  button: "border-border bg-card min-h-11 w-full overflow-hidden rounded-md border",
  webButton:
    "hover:border-primary focus-visible:ring-ring block transition-colors focus-visible:ring-2 focus-visible:outline-none motion-reduce:transition-none",
  image: "w-full",
  webImage: "aspect-[4/5] object-cover",
  label: "text-faint mt-0.5 text-[10.5px] leading-tight",
  webLabel: "line-clamp-2",
  large: "border-border mx-auto rounded-md border",
  webLarge: "max-h-[70vh] w-auto object-contain",
} as const;

/** The minimal markdown of chat replies and the plan: paragraphs, bullets, bold. */
export const richText = {
  paragraph: "mt-1",
  webParagraph: "first:mt-0",
  list: "mt-1 pl-4",
  webList: "list-disc space-y-0.5 first:mt-0",
  /** The app spaces the bullets with a gap (the web: space-y-0.5). */
  listGap: "gap-0.5",
  bold: "font-bold",
} as const;

// ----- Code -----------------------------------------------------------------------

export const codeViewer = {
  box: "min-h-full flex-col bg-card",
  text: "font-mono text-[12.5px] leading-[1.75] text-ink-2",
  web: "dodi-code flex",
  header: "flex-row flex-shrink-0 items-center justify-between gap-2 border-b border-border bg-background px-3 py-2",
  webHeader: "sticky top-0 z-10 flex",
  filename: "min-w-0 shrink flex-row items-center gap-2",
  filenameText: "font-sans text-[12px] font-medium text-muted-foreground",
  webFilename: "flex",
  actions: "flex-row flex-shrink-0 items-center gap-1",
  webActions: "flex",
  button: "flex-row items-center gap-1.5 rounded-md px-2 py-1",
  buttonText: "font-sans text-[12px] font-semibold",
  webButton: "inline-flex transition-colors",
  buttonActive: "bg-primary-soft",
  buttonActiveText: "text-primary",
  buttonIdleText: "text-muted-foreground",
  webButtonIdle: "hover:bg-primary-soft hover:text-primary",
  buttonDisabled: "opacity-40",
  webButtonDisabled: "cursor-not-allowed hover:bg-transparent hover:text-muted-foreground",
  body: "min-h-0 min-w-0 flex-1 flex-row",
  webBody: "flex overflow-auto",
  gutter: "flex-shrink-0 border-r border-border bg-card py-4 pl-4 pr-3",
  gutterText: "text-right text-faint",
  webGutter: "sticky left-0 z-[1] select-none",
  code: "py-4 pl-4 pr-8",
  webCode: "w-max",
} as const;

export const codeDiff = {
  gutter: "flex-shrink-0 border-r border-border bg-card py-4",
  skipNumber: "px-3 text-center",
  numbers: "flex-row gap-2 pl-4 pr-3",
  webNumbers: "flex",
  added: "bg-success-soft",
  removed: "bg-danger-soft",
  addedMarker: "text-success",
  removedMarker: "text-danger",
  body: "py-4 pr-8",
  webBody: "w-max",
  skip: "w-full pl-2",
  skipText: "text-left font-sans text-[12px] font-medium text-faint",
  webSkip: "block whitespace-pre transition-colors hover:text-primary",
  webLine: "whitespace-pre",
  marker: "w-6 text-center font-bold",
  webMarker: "inline-block select-none",
} as const;
