/**
 * The marketing site's legal pages (dodi-com/landing, route registry
 * `legalDocs`), linked from both apps: registration consent, Settings and the
 * store listings. The landing treats these slugs as stable; keep this map in
 * step with its `routePath` when one ever changes.
 */
export type LegalPage = "privacy" | "terms" | "imprint" | "deleteAccount";

export const LEGAL_PATHS: Record<LegalPage, { en: string; de: string }> = {
  privacy: { en: "/privacy", de: "/de/datenschutz" },
  terms: { en: "/terms", de: "/de/nutzungsbedingungen" },
  imprint: { en: "/imprint", de: "/de/impressum" },
  deleteAccount: { en: "/delete-account", de: "/de/konto-loeschen" },
};

/** The pages Settings lists under "Legal", in display order. */
export const SETTINGS_LEGAL_PAGES = ["privacy", "terms", "imprint"] as const satisfies readonly LegalPage[];

/** Absolute URL of a legal page on `siteUrl` (the site origin) in the app's locale; English otherwise. */
export function legalUrl(siteUrl: string, page: LegalPage, locale: string): string {
  const paths = LEGAL_PATHS[page];
  return `${siteUrl.replace(/\/+$/, "")}${locale === "de" ? paths.de : paths.en}`;
}
