import type { NextConfig } from "next";

/**
 * Marketing site — fully static. `output: "export"` emits pure HTML/CSS/JS to
 * `out/` with zero server/edge runtime (no middleware, no Node), so the apex
 * (dodi.app / www) is served straight from the CDN. Locale routing is handled by
 * explicit `/` (en) and `/de` routes — see src/app/(en) and src/app/(de).
 */
const nextConfig: NextConfig = {
  output: "export",
  // The default image optimizer needs a server; static export has none. Images
  // are pre-sized brand assets, so optimization isn't required at request time.
  images: { unoptimized: true },
};

export default nextConfig;
