/** Shared email design tokens. Mirrors the web app: Nunito, and the color
 *  tokens from globals.css (muted-foreground #61758C). Text uses #27374d. */

// Nunito first (loaded via <style> @import where the client supports webfonts;
// e.g. Apple Mail), then the same system fallback stack the app degrades to.
export const fontStack =
  '"Nunito", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

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
