import type { ListingText } from "@/lib/ai/client-translate-game";

function normalized(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Groups of locales whose listing DESCRIPTIONS are word-for-word identical,
 * which almost always means one of them was never translated (the review
 * agent rejects that as `soft_translation_quality`). Titles alone are not
 * compared: a name can legitimately be the same in every language. Empty
 * descriptions are ignored. Each group is sorted; groups come in locale order.
 */
export function findSameDescriptionGroups(
  translations: Record<string, ListingText>,
): string[][] {
  const byText = new Map<string, string[]>();
  for (const locale of Object.keys(translations).sort()) {
    const text = normalized(translations[locale].description);
    if (!text) continue;
    byText.set(text, [...(byText.get(text) ?? []), locale]);
  }
  return [...byText.values()].filter((group) => group.length > 1);
}

/** A locale's name in the UI language ("de" → "German"), falling back to the code. */
export function languageDisplayName(locale: string, uiLocale: string): string {
  try {
    return new Intl.DisplayNames([uiLocale], { type: "language" }).of(locale) ?? locale;
  } catch {
    return locale.toUpperCase();
  }
}
