/**
 * Shared avatar system constants + helpers (ported from the design handoff).
 *
 * The 28 avatar PNGs live in `public/avatars/<id>.png`. A profile's chosen look
 * is `{ color, avatar }`, stored E2EE-encrypted in `profiles.avatar_config`
 * (decrypted to an object before it reaches this module). The avatar-PIN puzzle
 * uses a curated, kid-friendly subset (`PIN_PALETTE`).
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

/** The 6 profile colors: soft background, strong foreground, avatar-ring. */
export const KID_AVA_COLORS: AvatarColor[] = [
  { bg: "#DCE9FA", fg: "#2F6BD8", ring: "#6E97E2" },
  { bg: "#E9F5F0", fg: "#2E8B6A", ring: "#6BAE94" },
  { bg: "#EFE9FA", fg: "#7456C4", ring: "#A088D6" },
  { bg: "#FEEBD2", fg: "#F7931A", ring: "#F9AC4F" },
  { bg: "#FBEAF1", fg: "#C2558A", ring: "#D687AC" },
  { bg: "#E2F3F3", fg: "#2E8B8B", ring: "#6BAEAE" },
];

export interface AvatarGroup {
  /** i18n key under the `avatar.group` namespace; the label is translated. */
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
  { key: "dinos",
    items: [
      "dino_trex",
      "dino_triceratops",
      "dino_brachi",
      "dino_anky",
      "dino_stego",
      "dino_baby"
    ],
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

/** Public path for an avatar image id. */
export function avatarSrc(id: string): string {
  return `/avatars/${id}.png`;
}

/**
 * Normalize a profile's (decrypted) `avatar_config` into `{ color, avatar }`,
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
  const rec =
    obj && typeof obj === "object" ? (obj as Record<string, unknown>) : null;
  const rawColor = rec && typeof rec.color === "number" ? rec.color : 0;
  const color = Math.min(Math.max(0, Math.floor(rawColor)), KID_AVA_COLORS.length - 1);
  const avatar = rec && typeof rec.avatar === "string" ? rec.avatar : null;
  return { color, avatar };
}
