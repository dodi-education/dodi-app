/**
 * How far text follows the OS font size (Settings > Display > Font size;
 * iOS Larger Text). Scaling always stays on (`allowFontScaling` is never
 * turned off); these caps only stop it where a fixed box would clip it.
 *
 * - body: all text by default. 2× is WCAG 1.4.4's 200%, and Android's
 *   largest step; iOS's accessibility sizes (up to ~3.1×) stop there so the
 *   web's phone layout still holds.
 * - control: labels in fixed-height controls (Button h-9, Input h-9): at 1.5×
 *   a 14px label (20pt line) needs 30pt and still fits the 36pt box.
 * - chrome: the always-visible bars (kid bottom nav, parent top bar title,
 *   header links) whose items share one row on a 360pt phone.
 * - none: glyphs that carry no reading (the PIN cells' dots).
 */
export const MAX_FONT_SCALE = {
  body: 2,
  control: 1.5,
  chrome: 1.3,
  none: 1,
} as const;
