import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const languages = { en: `${SITE_URL}/`, de: `${SITE_URL}/de` };
  return [
    { url: `${SITE_URL}/`, alternates: { languages } },
    { url: `${SITE_URL}/de`, alternates: { languages } },
  ];
}
