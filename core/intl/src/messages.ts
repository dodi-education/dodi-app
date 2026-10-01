/**
 * The UI message catalogs, shared by every client (web via next-intl, mobile
 * via use-intl: same ICU message format, same keys). English is the source
 * catalog; every other locale must carry exactly its keys (messages.test.ts).
 */
import type en from "../messages/en.json";

import type { Locale } from "./locales";

export type Messages = typeof en;

const LOADERS: Record<Locale, () => Promise<Messages>> = {
  en: async () => (await import("../messages/en.json")).default,
  de: async () => (await import("../messages/de.json")).default,
};

export function loadMessages(locale: Locale): Promise<Messages> {
  return LOADERS[locale]();
}
