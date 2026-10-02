/**
 * Game surfaces: the 4:5 stage card a game renders in (studio preview, parent
 * preview, kid play). Sizing differs by platform (the web budgets the viewport
 * height with CSS vars; the app fills the column width), the card does not.
 */

export const gameStage = {
  /** `framed`: the white card on the page background. */
  framed: "overflow-hidden rounded-[18px] border border-border bg-white",
  /** `bleed`: no card chrome, centered in its parent. */
  bleed: "overflow-hidden rounded-xl bg-white",
  bleedWrap: "h-full w-full items-center justify-center",
  web: "w-[var(--stage-w)] max-lg:portrait:w-full",
  webFramed: "shadow-[0_8px_28px_rgba(34,56,78,0.10)]",
  webBleedWrap: "flex",
} as const;
