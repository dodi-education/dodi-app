import type { Config } from "tailwindcss";
import { COLORS, RADIUS_PX } from "@dodi/design-tokens";

/**
 * Theme from @dodi/design-tokens: the same color names as the web's Tailwind
 * theme (bg-primary, text-ink, border-border-strong …), so class names port
 * between clients unchanged.
 */
export default {
  content: ["./src/**/*.{ts,tsx}", "../../core/ui-recipes/src/**/*.ts"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: COLORS,
      // Tailwind 4 (the web) derives any spacing step; v3 needs these listed.
      spacing: { 15: "3.75rem", 18: "4.5rem" },
      // The web's shadow-card (0 1px 2px rgba(34,56,78,0.04)).
      boxShadow: { card: "0 1px 2px rgba(34, 56, 78, 0.04)" },
      borderRadius: {
        sm: `${RADIUS_PX - 4}px`,
        md: `${RADIUS_PX - 2}px`,
        lg: `${RADIUS_PX}px`,
        xl: `${RADIUS_PX + 4}px`,
        "2xl": `${RADIUS_PX + 8}px`,
        "3xl": `${RADIUS_PX + 12}px`,
      },
    },
  },
} satisfies Config;
