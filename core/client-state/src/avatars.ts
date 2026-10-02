/**
 * The kid avatar system's data (no images): the six kid colors, the avatar
 * library grouped for the look picker, the avatar-PIN palette, and the reader
 * for a kid's (decrypted) `avatar_config`. Each client maps avatar ids to its
 * own image assets (web: lib/avatars, mobile: lib/avatar-images).
 *
 * A kid's look is `{ color, avatar }`, stored E2EE-sealed in
 * `kids.avatar_config`; this module only ever sees the decrypted value.
 */
import type { Json } from "@dodi/types/database";

export interface AvatarConfig {
  color: number;
  avatar: string | null;
}

export interface AvatarColor {
  bg: string;
  fg: string;
  ring: string;
}

/** The 6 kid colors: soft background, strong foreground, avatar-ring. */
export const KID_AVA_COLORS: AvatarColor[] = [
  { bg: "#DCE9FA", fg: "#2F6BD8", ring: "#6E97E2" },
  { bg: "#E9F5F0", fg: "#2E8B6A", ring: "#6BAE94" },
  { bg: "#EFE9FA", fg: "#7456C4", ring: "#A088D6" },
  { bg: "#FEEBD2", fg: "#F7931A", ring: "#F9AC4F" },
  { bg: "#FBEAF1", fg: "#C2558A", ring: "#D687AC" },
  { bg: "#E2F3F3", fg: "#2E8B8B", ring: "#6BAEAE" },
];

export interface AvatarGroup {
  /** i18n key under `kidProfile.group`; the label is translated. */
  key: string;
  items: string[];
}

/** The full avatar library, grouped for the kid's look picker. */
export const AVATAR_GROUPS: AvatarGroup[] = [
  {
    key: "animals",
    items: [
      "animal_cat",
      "animal_dog",
      "animal_rabbit",
      "animal_fox",
      "animal_bear",
      "animal_lion",
      "animal_giraffe",
      "animal_elephant",
      "animal_frog",
      "animal_ape",
      "animal_squid",
    ],
  },
  {
    key: "dinos",
    items: ["dino_trex", "dino_triceratops", "dino_brachi", "dino_anky", "dino_stego", "dino_baby"],
  },
  {
    key: "entities",
    items: [
      "entity_robot",
      "entity_alien",
      "entity_dragon",
      "entity_unicorn",
      "entity_mermaid",
      "entity_vampire",
      "entity_golem",
    ],
  },
  {
    key: "humans",
    items: [
      "human_astronaut",
      "human_knight",
      "human_princess",
      "human_wizard",
      "human_ninja",
      "human_pirate",
      "human_firefighter",
      "human_jester",
    ],
  },
];

/** Every avatar id, in picker order. */
export const AVATAR_IDS: string[] = AVATAR_GROUPS.flatMap((g) => g.items);

/** Curated, visually-distinct subset used for the avatar-PIN puzzle. */
export const PIN_PALETTE: string[] = [
  "animal_cat",
  "animal_dog",
  "animal_rabbit",
  "animal_fox",
  "animal_bear",
  "animal_lion",
  "animal_frog",
  "animal_ape",
];

/** Number of avatars in a PIN puzzle sequence. */
export const PIN_LENGTH = 3;

/**
 * Normalize a kid's (decrypted) `avatar_config` into `{ color, avatar }`,
 * with safe defaults. Accepts the decrypted object, a JSON string (defensive),
 * or null.
 */
export function readAvatarConfig(raw: Json | null | undefined): AvatarConfig {
  let obj: unknown = raw;
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw);
    } catch {
      obj = null;
    }
  }
  const rec = obj && typeof obj === "object" ? (obj as Record<string, unknown>) : null;
  const rawColor = rec && typeof rec.color === "number" ? rec.color : 0;
  const color = Math.min(Math.max(0, Math.floor(rawColor)), KID_AVA_COLORS.length - 1);
  const avatar = rec && typeof rec.avatar === "string" ? rec.avatar : null;
  return { color, avatar };
}

/** The color set for a kid's look (falls back to the first color). */
export function avatarColorOf(cfg: AvatarConfig): AvatarColor {
  return KID_AVA_COLORS[cfg.color] ?? KID_AVA_COLORS[0];
}

/** The initial shown when no avatar is picked ("?" for an empty name). */
export function avatarInitial(name: string | null | undefined): string {
  return (name?.[0] ?? "?").toUpperCase();
}

/** The ring padding around an avatar image: ~8% of the size, at least 2px. */
export function avatarRingPadding(size: number, pad?: number): number {
  return pad != null ? pad : Math.max(2, Math.round(size * 0.08));
}

/**
 * A friend without a picked avatar: a colored circle with their initial, the
 * color hashed from the label so a given friend always gets the same one.
 */
export const FRIEND_AVATAR_PALETTE: Array<{ bg: string; fg: string }> = [
  { bg: "#DCE9FA", fg: "#2F6BD8" },
  { bg: "#E9F5F0", fg: "#2E8B6A" },
  { bg: "#EFE9FA", fg: "#7456C4" },
  { bg: "#FDF1DC", fg: "#B0782A" },
  { bg: "#FBEAF1", fg: "#C2558A" },
  { bg: "#E2F3F3", fg: "#2E8B8B" },
];

export function friendAvatarColor(seed: string): { bg: string; fg: string } {
  let sum = 0;
  for (let i = 0; i < seed.length; i++) sum += seed.charCodeAt(i);
  return FRIEND_AVATAR_PALETTE[sum % FRIEND_AVATAR_PALETTE.length];
}
