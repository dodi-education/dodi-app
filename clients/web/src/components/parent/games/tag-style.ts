import type { IconName } from "@/components/shared/icon";
import { tagStyle as tagStyleCore } from "@dodi/studio/tag-style";

/** Shared tag colors + icon (`@dodi/studio/tag-style`), typed for the web `Icon`. */
export interface TagStyle {
  bg: string;
  fg: string;
  icon: IconName;
}

/**
 * Tag → colored tile + icon. Normalizes the tag and falls back to a neutral
 * style for anything outside the catalog.
 */
export function tagStyle(tag: string): TagStyle {
  // Catalog icons are Tabler slugs the web Icon resolves (GAME_TAGS).
  return tagStyleCore(tag) as TagStyle;
}
