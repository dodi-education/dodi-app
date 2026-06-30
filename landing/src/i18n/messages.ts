import type { Locale } from "@/lib/site";

import de from "./messages/de.json";
import en from "./messages/en.json";

/** Build-time message catalogue. Resolved synchronously via `createTranslator`
 *  in server components — no provider, no request context, no middleware. */
export const messages: Record<Locale, typeof en> = { en, de };
