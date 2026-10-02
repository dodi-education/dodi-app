/**
 * The kid avatar images, keyed by avatar id (the data, colors and groups are
 * `@dodi/client-state/avatars`; the web keeps the same files in
 * clients/web/src/assets/avatars). Metro bundles each `require` as an asset.
 */
import type { ImageSourcePropType } from "react-native";

const AVATAR_IMAGES: Record<string, ImageSourcePropType> = {
  animal_ape: require("../../assets/avatars/animal_ape.webp"),
  animal_bear: require("../../assets/avatars/animal_bear.webp"),
  animal_cat: require("../../assets/avatars/animal_cat.webp"),
  animal_dog: require("../../assets/avatars/animal_dog.webp"),
  animal_elephant: require("../../assets/avatars/animal_elephant.webp"),
  animal_fox: require("../../assets/avatars/animal_fox.webp"),
  animal_frog: require("../../assets/avatars/animal_frog.webp"),
  animal_giraffe: require("../../assets/avatars/animal_giraffe.webp"),
  animal_lion: require("../../assets/avatars/animal_lion.webp"),
  animal_rabbit: require("../../assets/avatars/animal_rabbit.webp"),
  animal_squid: require("../../assets/avatars/animal_squid.webp"),
  dino_anky: require("../../assets/avatars/dino_anky.webp"),
  dino_baby: require("../../assets/avatars/dino_baby.webp"),
  dino_brachi: require("../../assets/avatars/dino_brachi.webp"),
  dino_stego: require("../../assets/avatars/dino_stego.webp"),
  dino_trex: require("../../assets/avatars/dino_trex.webp"),
  dino_triceratops: require("../../assets/avatars/dino_triceratops.webp"),
  entity_alien: require("../../assets/avatars/entity_alien.webp"),
  entity_dragon: require("../../assets/avatars/entity_dragon.webp"),
  entity_golem: require("../../assets/avatars/entity_golem.webp"),
  entity_mermaid: require("../../assets/avatars/entity_mermaid.webp"),
  entity_robot: require("../../assets/avatars/entity_robot.webp"),
  entity_unicorn: require("../../assets/avatars/entity_unicorn.webp"),
  entity_vampire: require("../../assets/avatars/entity_vampire.webp"),
  human_astronaut: require("../../assets/avatars/human_astronaut.webp"),
  human_firefighter: require("../../assets/avatars/human_firefighter.webp"),
  human_jester: require("../../assets/avatars/human_jester.webp"),
  human_knight: require("../../assets/avatars/human_knight.webp"),
  human_ninja: require("../../assets/avatars/human_ninja.webp"),
  human_pirate: require("../../assets/avatars/human_pirate.webp"),
  human_princess: require("../../assets/avatars/human_princess.webp"),
  human_wizard: require("../../assets/avatars/human_wizard.webp"),
};

/** Resolve an avatar id to its bundled image, or null if unknown. */
export function avatarImage(id: string): ImageSourcePropType | null {
  return AVATAR_IMAGES[id] ?? null;
}
