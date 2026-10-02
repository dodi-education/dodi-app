import { useTranslations } from "use-intl";

/**
 * Resolver for a tag's localized display title (web: lib/games/tag-label).
 * Falls back to the raw id for any tag outside the translated catalog.
 */
export function useTagLabel(): (tagId: string) => string {
  const t = useTranslations("tags");
  return (tagId: string) => {
    const key = tagId.trim().toLowerCase();
    return t.has(key) ? t(key) : tagId;
  };
}
