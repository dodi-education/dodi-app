import { COLORS, RADIUS_PX } from "./tokens";

/** The CSS custom properties for every token (the content of tokens.css). */
export function renderTokensCss(): string {
  const lines = [
    "/* Generated from src/tokens.ts by `pnpm --filter @dodi/design-tokens build:css`. Do not edit. */",
    ":root {",
    `  --radius: ${RADIUS_PX / 16}rem;`,
    ...Object.entries(COLORS).map(([name, value]) => `  --${name}: ${value};`),
    "}",
    "",
  ];
  return lines.join("\n");
}
