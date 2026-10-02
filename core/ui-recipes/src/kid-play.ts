/**
 * Recipes: kid game library + play and snapshots (web: app/(kid)/games,
 * app/(kid)/snapshots, components/games/{game-library,game-card,
 * game-view-shell,game-play-view}, components/snapshots/*) and the parent's
 * snapshots overview. Same box / text / web split as kid.ts; values are the
 * web's phone layout.
 *
 * Kid text is Nunito: the web sets `font-kid` once on the kid root, the app's
 * kid components add it to each Text. Arbitrary shadows live in `web*`; the
 * app draws them with `kidShadow` (kid.ts).
 */

// ----- Library pages (games + snapshots) -----------------------------------------

/** The page frame of the kid's Games and Snapshots libraries. */
export const kidLibrary = {
  root: "w-full max-w-5xl",
  head: "flex-row flex-wrap items-center justify-between gap-3",
  webHead: "flex",
  title: "text-[27px] font-extrabold tracking-tight text-ink",
  subtitle: "mt-0.5 text-sm font-semibold text-muted-foreground",
  /** A section label ("Favorites", "From friends"…); the first gets `sectionFirst`. */
  section: "mb-3 text-[13px] font-extrabold uppercase tracking-[0.07em] text-faint",
  sectionFirst: "mt-5",
  sectionNext: "mt-6",
  /** The card grid: one column on a phone. */
  grid: "gap-3.5",
  webGrid: "grid sm:grid-cols-[repeat(auto-fill,minmax(310px,1fr))]",
} as const;

/** Loading / error / empty boxes of the libraries (the snapshots page adds `spaced`). */
export const kidLibraryState = {
  spaced: "mt-6",
  loading: "rounded-[20px] bg-white p-6",
  loadingText: "text-sm font-semibold text-muted-foreground",
  webLoading: "shadow-[0_2px_10px_rgba(34,56,78,0.05)]",
  error: "rounded-[20px] bg-danger-soft p-6",
  errorText: "text-sm font-semibold text-danger",
  empty: "rounded-[20px] bg-white/70 p-5",
  emptyText: "text-sm font-semibold text-muted-foreground",
} as const;

/** "Pick a kid first" on a library page without an active kid. */
export const kidRequiredCard = {
  box: "my-auto w-full max-w-xl rounded-[20px] bg-white p-6",
  web: "text-center shadow-[0_2px_10px_rgba(34,56,78,0.05)]",
  title: "text-xl font-extrabold text-ink",
  text: "mt-2 text-sm font-semibold text-muted-foreground",
  textAlign: "text-center",
} as const;

/** The game library's search + tag filter row. */
export const gameFilters = {
  row: "mb-6 mt-4 flex-row flex-wrap items-center gap-2",
  webRow: "flex",
  search: "w-[280px] flex-row items-center gap-2 rounded-full bg-white px-4 py-2",
  /** The app's ring (web: an inset box-shadow). */
  searchBorder: "border-[1.5px] border-border",
  searchFocused: "border-2 border-primary-soft-2",
  searchText: "text-faint",
  webSearch:
    "flex shadow-[inset_0_0_0_1.5px_var(--border)] focus-within:shadow-[inset_0_0_0_2px_var(--color-primary-soft-2)]",
  input: "min-w-0 flex-1 border-0 bg-transparent text-sm font-bold text-ink",
  webInput: "outline-none placeholder:font-semibold placeholder:text-faint",
  /** A tag chip: square-ish padding around its icon. */
  tagChip: "px-2",
  tagIcon: "size-5",
} as const;

// ----- Cards (game + snapshot) -------------------------------------------------------

/** One game / snapshot card in a kid library. */
export const kidCard = {
  box: "flex-col gap-3 rounded-[20px] bg-white p-[18px] pb-4",
  web: "flex shadow-[0_2px_10px_rgba(34,56,78,0.05)]",
  /** The tappable thumbnail + text block (opens the game / snapshot). */
  link: "flex-row items-start gap-3.5 rounded-[16px]",
  webLink: "group flex outline-none focus-visible:ring-2 focus-visible:ring-primary-soft-2",
  thumb: "size-[100px] shrink-0 rounded-[16px]",
  /** A snapshot thumbnail's frame. */
  snapshotThumb: "border border-border",
  webSnapshotThumb: "object-cover",
  tile: "size-[100px] shrink-0 items-center justify-center rounded-[16px]",
  webTile: "flex",
  /** The camera tile of a snapshot without a thumbnail. */
  snapshotTile: "bg-primary-soft",
  snapshotTileText: "text-primary",
  main: "min-w-0 flex-1",
  title: "text-[16.5px] font-extrabold leading-tight text-ink",
  webTitle: "group-hover:text-primary",
  metaRow: "mt-0.5 flex-row items-center gap-1.5",
  webMetaRow: "flex",
  meta: "text-[12.5px] font-bold text-faint",
  /** A snapshot's game title (its own line). */
  metaLine: "mt-0.5",
  tags: "flex-row items-center gap-1",
  webTags: "flex",
  tag: "size-[18px] items-center justify-center rounded-md",
  webTag: "flex",
  description: "mt-1.5 text-[13.5px] font-semibold leading-snug text-muted-foreground",
  /** Two lines (the app: numberOfLines). */
  webDescription: "line-clamp-2",
  badges: "mt-1.5 flex-row flex-wrap gap-1.5",
  webBadges: "flex",
  badge: "rounded-full px-2.5 py-0.5",
  badgeText: "text-[11.5px] font-extrabold",
  badgeFriend: "bg-primary-soft",
  badgeFriendText: "text-primary",
  badgeNew: "bg-danger-soft",
  badgeNewText: "text-danger",
  footer: "mt-auto flex-row items-center justify-between gap-2",
  webFooter: "flex",
  /** The heart / delete round button (44px). */
  iconButton: "size-11 items-center justify-center rounded-full disabled:opacity-40",
  iconButtonText: "text-danger",
  webIconButton:
    "flex transition-colors hover:bg-danger-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40",
  /** The Play / Open pill's extra width. */
  play: "px-6",
} as const;

/** Icon sizes on the cards. */
export const kidCardIcons = {
  tile: { size: 40, stroke: 1.6 },
  tag: { size: 13, stroke: 2 },
  heart: { size: 22, stroke: 2 },
  delete: { size: 20, stroke: 2 },
  play: { size: 13 },
} as const;

// ----- Full-mode game view (play) -------------------------------------------------

/** The play view's frame (web: components/games/game-view-shell), phone layout. */
export const gameViewShell = {
  root: "w-full flex-col gap-4 pb-4",
  webRoot: "flex",
  bar: "min-w-0 shrink flex-row items-center gap-3",
  webBar: "flex lg:grid lg:grid-cols-[300px_1fr] lg:gap-4",
  back: "shrink-0 flex-row",
  webBack: "flex",
  titleRow: "min-w-0 flex-1 flex-row items-center justify-between gap-3",
  webTitleRow: "flex lg:max-w-[var(--stage-w)]",
  titleWrap: "min-w-0 shrink",
  title: "text-[17px] font-extrabold text-ink",
  webTitle: "truncate lg:text-[21px]",
  cols: "gap-4",
  webCols: "grid lg:grid-cols-[300px_1fr]",
  /** The companion column (desktop only). */
  webSide: "hidden lg:block",
  content: "min-w-0 shrink",
} as const;

/** The play view's title-bar actions (photo + reset) and its error banner. */
export const gamePlayActions = {
  row: "shrink-0 flex-row items-center gap-4",
  webRow: "flex",
  photo: "gap-1.5 rounded-[12px] border border-border-strong bg-white px-3 py-2",
  photoText: "text-[13.5px] font-extrabold text-ink-2",
  webPhoto: "shadow-sm hover:bg-primary-soft hover:text-primary",
  divider: "h-7 w-px shrink-0 self-center bg-border-strong",
  reset: "rounded-[12px] border border-danger/30 bg-white",
  resetText: "text-danger",
  webReset: "shadow-sm hover:bg-danger-soft",
  icon: { size: 20, stroke: 2 },
  error: "mb-4 rounded-[14px] bg-danger-soft px-3 py-2",
  errorText: "text-xs font-semibold text-danger",
} as const;

/** A centered notice on the play pages (offline, no kid, unreadable snapshot). */
export const gamePlayNotice = {
  box: "w-full max-w-xl rounded-2xl border border-border bg-white p-6",
  web: "text-center shadow-sm",
  textAlign: "text-center",
  icon: "self-center",
  webIcon: "mx-auto text-muted-foreground",
  text: "mt-3 text-sm font-semibold text-muted-foreground",
  title: "text-xl font-bold text-dodi-800",
  body: "mt-2 text-sm text-muted-foreground",
} as const;

/** The flying snapshot card (web: components/snapshots/snapshot-flash). */
export const snapshotFlash = {
  overlay: "absolute inset-0 z-50",
  webOverlay: "pointer-events-none fixed",
  image: "absolute rounded-[16px] border-[3px] border-white",
  webImage: "object-cover shadow-[0_10px_30px_rgba(34,56,78,0.35)]",
  /** The app's rendering of webImage's shadow (RN shadow* + elevation). */
  shadow: { color: "#22384E", opacity: 0.35, radius: 30, offsetY: 10, elevation: 10 },
  /** Landing card size and its gap above the Snapshots nav item. */
  targetSize: 100,
  targetGap: 12,
  /** Flight, hold and fade durations (ms). */
  flyMs: 650,
  holdMs: 400,
  fadeMs: 250,
} as const;

/** A viewport (web) or window (app) rectangle for the snapshot flash. */
export interface SnapshotFlashRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The snapshot flash's landing card: `targetSize` square, centered
 * `targetGap` above the Snapshots item of the kid nav (`navItem`, in the same
 * coordinates as `viewport`), or bottom-center of the viewport when the page
 * has no kid nav.
 */
export function snapshotFlashTarget(
  navItem: SnapshotFlashRect | null,
  viewport: { width: number; height: number },
): SnapshotFlashRect {
  const { targetSize: size, targetGap: gap } = snapshotFlash;
  if (navItem) {
    return {
      left: navItem.left + navItem.width / 2 - size / 2,
      top: navItem.top - size - gap,
      width: size,
      height: size,
    };
  }
  return { left: viewport.width / 2 - size / 2, top: viewport.height - size - gap, width: size, height: size };
}

// ----- Parent snapshots overview ------------------------------------------------------

/** A row's thumbnail on /parent/snapshots (48px). */
export const parentSnapshotRow = {
  thumb: "size-12 shrink-0 rounded-md border border-border",
  webThumb: "object-cover",
  tile: "size-12 shrink-0 items-center justify-center rounded-md bg-primary-soft",
  tileText: "text-primary",
  webTile: "flex",
  tileIcon: { size: 22, stroke: 1.6 },
  /** The kid / type / usage filters. */
  filters: "mb-6 flex-row flex-wrap gap-3",
  webFilters: "flex",
  filter: "w-[180px]",
  empty: "rounded-lg border border-dashed border-border-strong px-5 py-8",
  emptyText: "text-sm text-muted-foreground",
  textAlign: "text-center",
  /** The import preview's camera tile (72px, like importPreview.thumb). */
  importTile: "h-18 w-18 shrink-0 items-center justify-center rounded-lg bg-primary-soft",
  webImportTile: "flex text-primary",
} as const;
