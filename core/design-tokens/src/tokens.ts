/**
 * dodi's design tokens — the one source of truth for colors and radii across
 * clients. The web consumes them as CSS variables (generated `tokens.css`,
 * mapped into Tailwind's theme in globals.css); the mobile app feeds the same
 * object to its NativeWind theme. Keys are the CSS variable names without the
 * leading `--`.
 *
 * Change a value here, then run `pnpm --filter @dodi/design-tokens build:css`
 * (tokens.test.ts fails while tokens.css is stale).
 */

/** The shadcn/ui semantic palette (names follow shadcn so its components theme for free). */
export const SEMANTIC_COLORS = {
  background: "#F5F8FB",
  foreground: "#22384E",
  card: "#FFFFFF",
  "card-foreground": "#22384E",
  popover: "#FFFFFF",
  "popover-foreground": "#22384E",
  primary: "#2F6BD8",
  "primary-foreground": "#FFFFFF",
  secondary: "#EAF1FC",
  "secondary-foreground": "#2659BC",
  muted: "#F5F8FB",
  "muted-foreground": "#61758C",
  accent: "#EAF1FC",
  "accent-foreground": "#2F6BD8",
  destructive: "#BF4F44",
  border: "#E4EAF1",
  input: "#D3DDE8",
  ring: "#2F6BD8",
  "chart-1": "#2F6BD8",
  "chart-2": "#2E8B6A",
  "chart-3": "#7456C4",
  "chart-4": "#B0782A",
  "chart-5": "#3A5068",
  sidebar: "#FFFFFF",
  "sidebar-foreground": "#22384E",
  "sidebar-primary": "#2F6BD8",
  "sidebar-primary-foreground": "#FFFFFF",
  "sidebar-accent": "#EAF1FC",
  "sidebar-accent-foreground": "#2F6BD8",
  "sidebar-border": "#E4EAF1",
  "sidebar-ring": "#2F6BD8",
} as const;

/** The dodi design-system palette on top of the semantic one. */
export const BRAND_COLORS = {
  ink: "#22384E",
  "ink-2": "#3A5068",
  faint: "#93A5B8",
  "primary-hover": "#2659BC",
  "primary-soft": "#EAF1FC",
  "primary-soft-2": "#DCE9FA",
  "border-strong": "#D3DDE8",
  success: "#2E8B6A",
  "success-soft": "#E9F5F0",
  danger: "#BF4F44",
  "danger-soft": "#FBEFEE",
  warning: "#9A6B12",
  "warning-soft": "#FBF3E2",
  // Kid avatar accents (with primary and success, the four avatar pairs)
  violet: "#7456C4",
  "violet-soft": "#EFE9FA",
  amber: "#B0782A",
  "amber-soft": "#FDF1DC",
  // Public-page footer (ported from the landing site's dark footer)
  "ink-deep": "#20374D",
  mist: "#AFC2D8",
  "mist-2": "#8FA3BC",
  "mist-3": "#7E92AC",
  // dodi brand scale
  "dodi-50": "#F5F8FB",
  "dodi-100": "#EAF1FC",
  "dodi-200": "#DCE9FA",
  "dodi-300": "#B9D2F4",
  "dodi-400": "#93A5B8",
  "dodi-500": "#2F6BD8",
  "dodi-600": "#2659BC",
  "dodi-700": "#3A5068",
  "dodi-800": "#22384E",
  "dodi-900": "#1A2B3D",
} as const;

export const COLORS = { ...SEMANTIC_COLORS, ...BRAND_COLORS } as const;

export type ColorToken = keyof typeof COLORS;

/** Base corner radius in px; the scale (sm … 4xl) is derived from it per client. */
export const RADIUS_PX = 8;
