/**
 * The Intl APIs the app (and the shared core) uses that Hermes leaves out.
 * Hermes (RN 0.86, hermes-android 250829098.0.17) implements only Intl.Collator,
 * DateTimeFormat, NumberFormat and getCanonicalLocales; the rest is installed
 * here, with data for every UI language (@dodi/intl/locales). Loaded by
 * `polyfills.ts`, so it runs before use-intl or any core package formats.
 *
 * - `PluralRules`: every ICU `{count, plural, …}` / `selectordinal` message
 *   (intl-messageformat, via use-intl). Without it they fail to format.
 * - `ListFormat`: "German and French" (listing-same-text-warning).
 * - `DisplayNames`: language names on the publish and translation screens
 *   (@dodi/client-state/listing-checks).
 * - `supportedValuesOf`: the timezone picker (@dodi/client-state/date-preferences).
 *
 * Each one is installed only where the runtime lacks it or can't serve every
 * UI language, so an engine that ships it natively keeps its own.
 *
 * Locale data: one import per UI language and API below. Adding a locale to
 * SUPPORTED_LOCALES needs its data imports here too (intl-polyfills.test.ts
 * fails until it has them). The data modules run before the code below (imports
 * are hoisted), find no polyfill on `Intl` yet and buffer their data on
 * globalThis; `install` hands that buffer to the polyfill, the same contract
 * the packages' own `polyfill.js` entries use.
 */
import { DisplayNames } from "@formatjs/intl-displaynames";
import "@formatjs/intl-displaynames/locale-data/de.js";
import "@formatjs/intl-displaynames/locale-data/en.js";
import ListFormat from "@formatjs/intl-listformat";
import "@formatjs/intl-listformat/locale-data/de.js";
import "@formatjs/intl-listformat/locale-data/en.js";
import { PluralRules } from "@formatjs/intl-pluralrules";
import "@formatjs/intl-pluralrules/locale-data/de.js";
import "@formatjs/intl-pluralrules/locale-data/en.js";
import { supportedValuesOf } from "@formatjs/intl-supportedvaluesof";
import { SUPPORTED_LOCALES } from "@dodi/intl/locales";

interface LocaleDataPolyfill {
  __addLocaleData(...data: never[]): void;
}

const intl = Intl as unknown as Record<string, unknown>;
const buffers = globalThis as unknown as Record<string, unknown[] | undefined>;

function define(name: string, value: unknown): void {
  Object.defineProperty(Intl, name, { value, configurable: true, writable: true });
}

/** The runtime's constructor is missing, or can't serve every UI language. */
function isMissing(name: string): boolean {
  const native = intl[name];
  if (typeof native !== "function") return true;
  const { supportedLocalesOf } = native as { supportedLocalesOf?: (locales: string[]) => string[] };
  try {
    return supportedLocalesOf?.call(native, [...SUPPORTED_LOCALES]).length !== SUPPORTED_LOCALES.length;
  } catch {
    return true;
  }
}

/**
 * Hands the buffered locale data to `polyfill` (always, so the class is
 * complete whenever it gets installed) and installs it as `Intl[name]` where
 * the runtime needs it.
 */
function install(name: string, polyfill: LocaleDataPolyfill, bufferKey: string): void {
  const data = buffers[bufferKey];
  delete buffers[bufferKey];
  if (data?.length) polyfill.__addLocaleData(...(data as never[]));
  if (isMissing(name)) define(name, polyfill);
}

install("PluralRules", PluralRules, "__FORMATJS_PLURALRULES_DATA__");
install("ListFormat", ListFormat, "__FORMATJS_LISTFORMAT_DATA__");
install("DisplayNames", DisplayNames, "__FORMATJS_DISPLAYNAMES_DATA__");

if (typeof intl.supportedValuesOf !== "function") define("supportedValuesOf", supportedValuesOf);
