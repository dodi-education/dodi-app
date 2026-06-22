import type { IconName } from "@/components/shared/icon";

export interface TagStyle {
  bg: string;
  fg: string;
  icon: IconName;
}

/**
 * Tag → colored tile + icon, matching the Game Studio design. Tags are
 * free-form strings, so we normalize and fall back to a neutral style.
 */
const TAG_STYLES: Record<string, TagStyle> = {
  counting: { bg: "#EFE9FA", fg: "#7456C4", icon: "games" },
  math: { bg: "#E8F0FC", fg: "#2F6BD8", icon: "dashboard" },
  language: { bg: "#FDE9EF", fg: "#C0497B", icon: "globe" },
  creativity: { bg: "#FDF1DC", fg: "#B0782A", icon: "feature_personal" },
  art: { bg: "#FDF1DC", fg: "#B0782A", icon: "feature_personal" },
  science: { bg: "#E6F4F6", fg: "#2A8A99", icon: "feature_smart" },
  stories: { bg: "#E9F5F0", fg: "#2E8B6A", icon: "personas" },
  reading: { bg: "#E9F5F0", fg: "#2E8B6A", icon: "personas" },
};

const DEFAULT_STYLE: TagStyle = { bg: "#EEF1F5", fg: "#61758C", icon: "games" };

export function tagStyle(tag: string): TagStyle {
  return TAG_STYLES[tag.trim().toLowerCase()] ?? DEFAULT_STYLE;
}
