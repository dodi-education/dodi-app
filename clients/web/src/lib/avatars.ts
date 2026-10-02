/**
 * The avatar images (data: `@dodi/client-state/avatars`).
 *
 * The 32 avatar images live in `src/assets/avatars/<id>.webp` and are imported as
 * ES modules (see `AVATAR_IMAGES`) so Next serves them as content-hashed, immutably
 * cached static files — not via `/_next/image`. Regenerate them from source art with
 * `scripts/optimize-avatars.mjs`. A kid's chosen look is `{ color, avatar }`,
 * stored E2EE-encrypted in `kids.avatar_config` (decrypted to an object before it
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

// The avatar data (colors, groups, PIN palette, config reader) is shared with
// the app; only the image assets are this client's.
export {
  type AvatarColor,
  type AvatarConfig,
  type AvatarGroup,
  AVATAR_GROUPS,
  KID_AVA_COLORS,
  PIN_LENGTH,
  PIN_PALETTE,
  readAvatarConfig,
} from "@dodi/client-state/avatars";

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
