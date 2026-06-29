/**
 * Shared avatar system constants + helpers (ported from the design handoff).
 *
 * The 32 avatar images live in `src/assets/avatars/<id>.webp` and are imported as
 * ES modules (see `AVATAR_IMAGES`) so Next serves them as content-hashed, immutably
 * cached static files — not via `/_next/image`. Regenerate them from source art with
 * `scripts/optimize-avatars.mjs`. A profile's chosen look is `{ color, avatar }`,
 * stored E2EE-encrypted in `profiles.avatar_config` (decrypted to an object before it
 * reaches this module). The avatar-PIN puzzle uses a curated subset (`PIN_PALETTE`).
 */
import type { StaticImageData } from "next/image";

import animal_ape from "@/assets/avatars/animal_ape.webp";
import animal_bear from "@/assets/avatars/animal_bear.webp";
import animal_cat from "@/assets/avatars/animal_cat.webp";
import animal_dog from "@/assets/avatars/animal_dog.webp";
import animal_elephant from "@/assets/avatars/animal_elephant.webp";
import animal_fox from "@/assets/avatars/animal_fox.webp";
import animal_frog from "@/assets/avatars/animal_frog.webp";
import animal_giraffe from "@/assets/avatars/animal_giraffe.webp";
import animal_lion from "@/assets/avatars/animal_lion.webp";
import animal_rabbit from "@/assets/avatars/animal_rabbit.webp";
import animal_squid from "@/assets/avatars/animal_squid.webp";
import dino_anky from "@/assets/avatars/dino_anky.webp";
import dino_baby from "@/assets/avatars/dino_baby.webp";
import dino_brachi from "@/assets/avatars/dino_brachi.webp";
import dino_stego from "@/assets/avatars/dino_stego.webp";
import dino_trex from "@/assets/avatars/dino_trex.webp";
import dino_triceratops from "@/assets/avatars/dino_triceratops.webp";
import entity_alien from "@/assets/avatars/entity_alien.webp";
import entity_dragon from "@/assets/avatars/entity_dragon.webp";
import entity_golem from "@/assets/avatars/entity_golem.webp";
import entity_mermaid from "@/assets/avatars/entity_mermaid.webp";
import entity_robot from "@/assets/avatars/entity_robot.webp";
import entity_unicorn from "@/assets/avatars/entity_unicorn.webp";
import entity_vampire from "@/assets/avatars/entity_vampire.webp";
import human_astronaut from "@/assets/avatars/human_astronaut.webp";
import human_firefighter from "@/assets/avatars/human_firefighter.webp";
import human_jester from "@/assets/avatars/human_jester.webp";
import human_knight from "@/assets/avatars/human_knight.webp";
import human_ninja from "@/assets/avatars/human_ninja.webp";
import human_pirate from "@/assets/avatars/human_pirate.webp";
import human_princess from "@/assets/avatars/human_princess.webp";
import human_wizard from "@/assets/avatars/human_wizard.webp";

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

/**
 * All avatar images, keyed by id. Imported as ES modules so Next emits them as
 * content-hashed, immutably-cached static files (`/_next/static/media/…`) served
 * straight from the CDN — never through the `/_next/image` optimization endpoint.
 */
export const AVATAR_IMAGES: Record<string, StaticImageData> = {
  animal_ape,
  animal_bear,
  animal_cat,
  animal_dog,
  animal_elephant,
  animal_fox,
  animal_frog,
  animal_giraffe,
  animal_lion,
  animal_rabbit,
  animal_squid,
  dino_anky,
  dino_baby,
  dino_brachi,
  dino_stego,
  dino_trex,
  dino_triceratops,
  entity_alien,
  entity_dragon,
  entity_golem,
  entity_mermaid,
  entity_robot,
  entity_unicorn,
  entity_vampire,
  human_astronaut,
  human_firefighter,
  human_jester,
  human_knight,
  human_ninja,
  human_pirate,
  human_princess,
  human_wizard,
};

/** Resolve an avatar id to its hashed static image, or null if unknown. */
export function avatarImage(id: string): StaticImageData | null {
  return AVATAR_IMAGES[id] ?? null;
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
