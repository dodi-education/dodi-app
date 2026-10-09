/**
 * The built-in character catalog: every avatar a companion can wear and every
 * accessory it can put on, with what the app needs to know about each model
 * without loading it (bones for tricks, customizable materials for the
 * Playground, built-in tricks). Pure data, no three.js, so client-state and the
 * AI prompts can import it.
 *
 * The files ship with the apps (characters/README.md, `kit.publish_to_web`).
 * character-catalog.test.ts checks this table against the real .glb files.
 */
import type { MotionScript } from "./motion-script";
import { BACKFLIP, PIROUETTE, WAVE } from "./tricks/dodi";

export type CharacterModelId = "dodi";

/** A material the kid may recolor in the Playground. */
export interface CustomizablePart {
  /** glTF material name. */
  material: string;
  /** Message key under `playground.parts`. */
  labelKey: string;
}

/** A hand-made trick every companion of the model knows. */
export interface BuiltInTrick {
  id: string;
  /** Message key under `playground.tricks`. */
  labelKey: string;
  script: MotionScript;
}

export interface CharacterModel {
  /** A catalog id, or `custom:<uuid>` for a family's own avatar (characterModelFor). */
  id: CharacterModelRef;
  /** The companion's name until the kid picks one. */
  stockName: string;
  /** Path under the apps' `characters/` asset folder. */
  file: string;
  /** Message key under `playground.avatars`. */
  labelKey: string;
  /** Every bone of the rig (tricks may only move these). */
  bones: readonly string[];
  face: { eyes: readonly string[]; mouth: readonly string[] };
  customizable: readonly CustomizablePart[];
  tricks: readonly BuiltInTrick[];
}

export const CHARACTER_MODELS: Record<CharacterModelId, CharacterModel> = {
  dodi: {
    id: "dodi",
    stockName: "dodi",
    file: "dodi.glb",
    labelKey: "dodi",
    bones: [
      "root",
      "body",
      "neck",
      "head",
      "jaw",
      "tail",
      "wing_L",
      "wing_R",
      "leg_L",
      "leg_R",
      "foot_L",
      "foot_R",
      "antenna_L",
      "antenna_R",
    ],
    face: {
      eyes: ["open", "closed", "up", "happy", "sad"],
      mouth: ["smile", "neutral", "frown"],
    },
    customizable: [
      { material: "skin", labelKey: "skin" },
      { material: "suit", labelKey: "suit" },
      { material: "beak", labelKey: "beak" },
    ],
    tricks: [
      { id: "pirouette", labelKey: "pirouette", script: PIROUETTE },
      { id: "backflip", labelKey: "backflip", script: BACKFLIP },
      { id: "wave", labelKey: "wave", script: WAVE },
    ],
  },
};

export const DEFAULT_CHARACTER_MODEL: CharacterModelId = "dodi";

export function isCharacterModelId(value: unknown): value is CharacterModelId {
  return typeof value === "string" && Object.hasOwn(CHARACTER_MODELS, value);
}

export type AccessoryName = "headphones" | "party_hat" | "glasses" | "scarf";

export interface Accessory {
  name: AccessoryName;
  /** Path under the apps' `characters/` asset folder. */
  file: string;
  socket: string;
  /** Kids can put it on in the Playground (headphones belong to the deaf pose). */
  isKidSelectable: boolean;
  /** Clips during which a worn accessory is taken off (it would clash). */
  hiddenDuringClips: readonly string[];
  /** Message key under `playground.accessories`. */
  labelKey: string;
}

export const ACCESSORIES: Record<AccessoryName, Accessory> = {
  headphones: {
    name: "headphones",
    file: "accessories/headphones.glb",
    socket: "socket_ears",
    isKidSelectable: false,
    hiddenDuringClips: [],
    labelKey: "headphones",
  },
  party_hat: {
    name: "party_hat",
    file: "accessories/party_hat.glb",
    socket: "socket_head_top",
    isKidSelectable: true,
    hiddenDuringClips: ["deaf"],
    labelKey: "partyHat",
  },
  glasses: {
    name: "glasses",
    file: "accessories/glasses.glb",
    socket: "socket_eyes",
    isKidSelectable: true,
    hiddenDuringClips: [],
    labelKey: "glasses",
  },
  scarf: {
    name: "scarf",
    file: "accessories/scarf.glb",
    socket: "socket_neck",
    isKidSelectable: true,
    hiddenDuringClips: [],
    labelKey: "scarf",
  },
};

export const ACCESSORY_LIST: readonly AccessoryName[] = Object.keys(ACCESSORIES) as AccessoryName[];

export function isAccessoryName(value: unknown): value is AccessoryName {
  return typeof value === "string" && Object.hasOwn(ACCESSORIES, value);
}

/** A color the kid can pick: the lit tone and its toon shadow tone. */
export interface ColorSwatch {
  base: string;
  shade: string;
}

/** Curated, kid-friendly colors that read well in toon shading. */
export const COLOR_SWATCHES: readonly ColorSwatch[] = [
  { base: "#78b4d8", shade: "#5f93bd" }, // sky (dodi's own blue)
  { base: "#fbfcfd", shade: "#a8ccd8" }, // cloud
  { base: "#6c84a8", shade: "#56709a" }, // slate
  { base: "#f4a3b8", shade: "#d07f96" }, // bubblegum
  { base: "#ff8a5c", shade: "#d9693f" }, // tangerine
  { base: "#ffd45c", shade: "#d9ac3a" }, // sunshine
  { base: "#8fd694", shade: "#68b06e" }, // mint
  { base: "#4fb3a9", shade: "#3a8f86" }, // lagoon
  { base: "#b49cf0", shade: "#8e78cc" }, // lavender
  { base: "#e2574c", shade: "#b63f36" }, // cherry
  { base: "#a5784f", shade: "#82593a" }, // cocoa
  { base: "#4a5568", shade: "#353e4d" }, // midnight
];

// ----- Custom assets ---------------------------------------------------------
//
// A family's own avatars and accessories (character_assets, sealed) are not in
// the catalog. A look refers to one as `custom:<asset id>`.

export const CUSTOM_ASSET_PREFIX = "custom:";

/** A reference to a family's own avatar or accessory: `custom:<uuid>`. */
export type CustomAssetRef = `custom:${string}`;
/** What a look's `model` holds: a catalog avatar or a custom one. */
export type CharacterModelRef = CharacterModelId | CustomAssetRef;
/** What a look's `accessories` hold: catalog accessories or custom ones. */
export type AccessoryRef = AccessoryName | CustomAssetRef;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isCustomAssetRef(value: unknown): value is CustomAssetRef {
  return (
    typeof value === "string" &&
    value.startsWith(CUSTOM_ASSET_PREFIX) &&
    UUID.test(value.slice(CUSTOM_ASSET_PREFIX.length))
  );
}

export function customAssetRef(assetId: string): CustomAssetRef {
  return `${CUSTOM_ASSET_PREFIX}${assetId.toLowerCase()}`;
}

/** The asset id of a custom ref; null for a catalog id. */
export function customAssetIdOf(ref: string): string | null {
  return isCustomAssetRef(ref) ? ref.slice(CUSTOM_ASSET_PREFIX.length).toLowerCase() : null;
}

/**
 * What the app knows about a model without loading it. A custom avatar follows
 * the format's skeleton conventions (characters/README.md), so it is described
 * as the stock rig: tricks are fitted to its real bones once it has loaded
 * (`withRigBones`). It offers no recolorable parts.
 */
export function characterModelFor(ref: CharacterModelRef): CharacterModel {
  if (isCharacterModelId(ref)) return CHARACTER_MODELS[ref];
  const stock = CHARACTER_MODELS[DEFAULT_CHARACTER_MODEL];
  return { ...stock, id: ref, file: "", labelKey: "custom", customizable: [] };
}

/** A model description narrowed to the bones a loaded rig really has. */
export function withRigBones(model: CharacterModel, bones: readonly string[]): CharacterModel {
  return { ...model, bones: [...bones] };
}

/** The socket an accessory rides on: the catalog's, or a custom one's (from its sealed meta). */
export function accessorySocketOf(
  ref: AccessoryRef,
  customSockets?: ReadonlyMap<string, string>,
): string | null {
  if (isAccessoryName(ref)) return ACCESSORIES[ref].socket;
  const id = customAssetIdOf(ref);
  return id === null ? null : (customSockets?.get(id) ?? null);
}
