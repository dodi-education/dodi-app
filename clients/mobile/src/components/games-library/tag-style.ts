import { tagStyle as tagStyleCore } from "@dodi/studio/tag-style";

import type { IconName } from "@/components/ui";

/** Shared tag colors + icon (`@dodi/studio/tag-style`), typed for the app's `Icon`. */
export interface TagStyle {
  bg: string;
  fg: string;
  icon: IconName;
}

/** Tag → colored tile + icon; a neutral style for anything outside the catalog. */
export function tagStyle(tag: string): TagStyle {
  // Catalog icons are Tabler slugs the Icon registry names (GAME_TAGS).
  return tagStyleCore(tag) as TagStyle;
}
