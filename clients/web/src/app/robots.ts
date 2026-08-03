import type { MetadataRoute } from "next";

import { locales } from "@/i18n/config";

/**
 * Only the public game pages — unprefixed and locale-prefixed — (and the auth
 * entry points they link to) are crawlable; everything else in the app is a
 * signed-in surface. Most-specific match wins, so the allows override the
 * blanket disallow.
 */
export default function robots(): MetadataRoute.Robots {
  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ?? "https://app.dodi.app"
  ).replace(/\/+$/, "");
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/games/",
          ...locales.map((locale) => `/${locale}/games/`),
          "/login",
          "/register",
        ],
        disallow: "/",
      },
    ],
    sitemap: `${appUrl}/sitemap.xml`,
  };
}
