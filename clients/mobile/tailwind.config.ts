import type { Config } from "tailwindcss";
import { COLORS, RADIUS_PX } from "@dodi/design-tokens";

/**
 * Theme from @dodi/design-tokens: the same color names as the web's Tailwind
 * theme (bg-primary, text-ink, border-border-strong …), so class names port
 * between clients unchanged.
 */
export default {
  content: ["./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: COLORS,
      borderRadius: {
        sm: `${RADIUS_PX - 4}px`,
        md: `${RADIUS_PX - 2}px`,
        lg: `${RADIUS_PX}px`,
        xl: `${RADIUS_PX + 4}px`,
        "2xl": `${RADIUS_PX + 8}px`,
      },
    },
  },
} satisfies Config;
