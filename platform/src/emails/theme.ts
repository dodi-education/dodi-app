/** Shared email design tokens. Mirrors the web app: Nunito, and the color
 *  tokens from globals.css (muted-foreground #61758C). Text uses #27374d. */

// Nunito first (used if the recipient has it locally installed), then the same
// system fallback stack the app degrades to. We deliberately DON'T load Nunito
// as a webfont: Gmail/Outlook/Yahoo ignore @font-face entirely (only ~Apple Mail
// honors it), and an external font @import trips deliverability heuristics for a
// cosmetic gain invisible in the dominant clients.
export const fontStack =
  '"Nunito", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

/**
 * Base URL for platform-hosted email assets (the logo). The platform serves
 * `/dodi-logo.png` from its OWN origin (platform.dodi.app) — kept here, next to the
 * email code, so the asset doesn't depend on the web app's deploy. Override with
 * EMAIL_ASSET_BASE_URL (e.g. the dev platform origin or a CDN).
 */
export function emailAssetBaseUrl(): string {
  return (process.env.EMAIL_ASSET_BASE_URL ?? "https://platform.dodi.app").replace(
    /\/+$/,
    "",
  );
}

export const colors = {
  bg: "#F4F7FB",
  card: "#FFFFFF",
  border: "#E6ECF3",
  /** Primary text (headings + body). */
  text: "#27374d",
  /** .text-muted-foreground — hints & disclaimers. */
  muted: "#61758C",
  /** CTA / primary brand blue. */
  primary: "#2F6BD8",
} as const;
