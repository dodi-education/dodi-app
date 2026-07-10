"use client";

import { useTranslations } from "next-intl";

/**
 * Resolver for a tag's localized display title. Falls back to the raw id for any
 * tag outside the translated catalog (e.g. a legacy tag on an old game), so a
 * stray tag never crashes rendering.
 */
export function useTagLabel(): (tagId: string) => string {
  const t = useTranslations("tags");
  return (tagId: string) => {
    const key = tagId.trim().toLowerCase();
    return t.has(key) ? t(key) : tagId;
  };
}
