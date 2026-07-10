import type { IconName } from "@/components/shared/icon";
import { GAME_TAGS, type GameTag } from "@dodi/games/tags";

export interface TagStyle {
  bg: string;
  fg: string;
  icon: IconName;
}

/**
 * Per-tag color (soft background + saturated foreground), grouped loosely by
 * subject family. Drives the colored fallback tile and the tag chips. The icon
 * comes from the canonical catalog ({@link GAME_TAGS}); colors live here because
 * they're a pure web-presentation concern.
 */
const TAG_COLORS: Record<GameTag, { bg: string; fg: string }> = {
  // Language & literacy
  alphabet: { bg: "#FDE9EF", fg: "#C0497B" },
  reading: { bg: "#FCEEE7", fg: "#C4622F" },
  writing: { bg: "#FDF1DC", fg: "#B0782A" },
  grammar: { bg: "#F6ECFA", fg: "#9A55B8" },
  // Numbers & math
  numbers: { bg: "#E8F0FC", fg: "#2F6BD8" },
  math: { bg: "#E9EAFB", fg: "#4257C7" },
  // Science
  physics: { bg: "#E6F4F6", fg: "#2A8A99" },
  chemistry: { bg: "#E7F2EC", fg: "#2E8B6A" },
  biology: { bg: "#EBF5E3", fg: "#4E9A2E" },
  // Creative
  drawing: { bg: "#FDECE6", fg: "#C4552F" },
  music: { bg: "#FCEAF3", fg: "#BC4785" },
  // Thinking & logic
  coding: { bg: "#EFE9FA", fg: "#7456C4" },
  reasoning: { bg: "#EAEDF3", fg: "#55688C" },
  discernment: { bg: "#EDE7F7", fg: "#7C5AB6" },
  philosophy: { bg: "#EAEAF6", fg: "#5B4F9E" },
  // AI capabilities
  ai: { bg: "#F0EBFB", fg: "#6D4FC9" },
  "ai-image": { bg: "#E7EEFC", fg: "#3B6FD6" },
};

const TAG_ICONS = Object.fromEntries(
  GAME_TAGS.map((tag) => [tag.id, tag.icon]),
) as Record<GameTag, IconName>;

const DEFAULT_STYLE: TagStyle = { bg: "#EEF1F5", fg: "#61758C", icon: "games" };

/**
 * Tag → colored tile + icon. Normalizes the tag and falls back to a neutral
 * style for anything outside the catalog.
 */
export function tagStyle(tag: string): TagStyle {
  const id = tag.trim().toLowerCase() as GameTag;
  const color = TAG_COLORS[id];
  const icon = TAG_ICONS[id];
  if (!color || !icon) return DEFAULT_STYLE;
  return { bg: color.bg, fg: color.fg, icon };
}
