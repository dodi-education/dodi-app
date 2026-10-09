/**
 * The 3D companion's platform side on the app: the catalog's character files bundled as
 * assets (expo-asset, read with expo-file-system and parsed by
 * @dodi/character, which decodes their PNG textures in script) and a three.js
 * renderer on an expo-gl context (GL ES 3, which three drives as WebGL 2).
 * The scene logic (poses, clips, toon shading, outlines) is @dodi/character's.
 */
import { Asset } from "expo-asset";
import { File } from "expo-file-system";
import type { ExpoWebGLRenderingContext } from "expo-gl";
import {
  ACCESSORY_LIST,
  CharacterStage,
  DEFAULT_CHARACTER_MODEL,
  addCustomAccessories,
  buildMotionClip,
  characterModelFor,
  fitMotionScript,
  isCustomAssetRef,
  loadCustomAvatar,
  parseCharacterFile,
  rendererForContext,
  withRigBones,
  type AccessoryName,
  type CharacterFile,
  type CharacterModelId,
  type CharacterModelRef,
  type CompanionLook,
  type MotionScript,
  type TrickOutcome,
} from "@dodi/character";

import { clientState } from "@/lib/client-state";

// The catalog's files (CHARACTER_MODELS / ACCESSORIES), the same ones the web
// serves from clients/web/public/characters (the character pipeline writes both
// copies; core/character's tests compare them). Metro bundles assets only
// through static require() calls (glb is in metro.config.js assetExts), so each
// catalog entry is listed here; the Record types make a new model or accessory
// in the catalog fail the typecheck until its file is added.
/* eslint-disable @typescript-eslint/no-require-imports */
const CHARACTER_MODULES: Record<CharacterModelId, number> = {
  dodi: require("../../assets/characters/dodi.glb"),
};
const ACCESSORY_MODULES: Record<AccessoryName, number> = {
  headphones: require("../../assets/characters/accessories/headphones.glb"),
  party_hat: require("../../assets/characters/accessories/party_hat.glb"),
  glasses: require("../../assets/characters/accessories/glasses.glb"),
  scarf: require("../../assets/characters/accessories/scarf.glb"),
};
/* eslint-enable @typescript-eslint/no-require-imports */

// three's GLTFLoader reads navigator.userAgent to pick an image loader (it
// sniffs Safari and Firefox); React Native's navigator has no userAgent, and
// `undefined.match` would throw. The images never reach that loader here.
const nav = (globalThis as { navigator?: { userAgent?: unknown } }).navigator;
if (nav && typeof nav.userAgent !== "string") nav.userAgent = "ReactNative";

export type CharacterRenderer = ReturnType<typeof rendererForContext>;

// A family's own avatars and accessories: fetched and opened by the store, loaded from bytes.
const customAssetBytes = (assetId: string): Promise<Uint8Array> =>
  clientState.characterAssets.getState().getBytes(assetId);

async function readAsset(moduleId: number): Promise<CharacterFile> {
  const asset = Asset.fromModule(moduleId);
  await asset.downloadAsync();
  if (!asset.localUri) throw new Error(`character asset ${asset.name} has no local file`);
  const bytes = await new File(asset.localUri).arrayBuffer();
  return parseCharacterFile(bytes);
}

// The voice level of the view that shows the character now (the latest mount).
let activeVoiceLevel: () => number = () => 0;
function currentVoiceLevel(): number {
  return activeVoiceLevel();
}

// One stage per avatar model, loaded when first shown.
const loading = new Map<CharacterModelRef, Promise<CharacterStage>>();
const readyStages = new Map<CharacterModelRef, CharacterStage>();
let lastLook: CompanionLook | null = null;

/**
 * A model's stage for the app session: the character and the accessories,
 * loaded once. Views share it, so a view that replaces another carries the
 * clip on. Rejects if the model fails; an accessory that fails to load is
 * left out rather than failing the stage (web: lib/character/character-stage).
 */
export function loadCharacterStage(model: CharacterModelRef = DEFAULT_CHARACTER_MODEL): Promise<CharacterStage> {
  const existing = loading.get(model);
  if (existing) return existing;
  const promise = (async () => {
    const [character, ...accessories] = await Promise.all([
      // A catalog avatar from the bundle; a family's own from its decrypted bytes.
      isCustomAssetRef(model) ? loadCustomAvatar(model, customAssetBytes) : readAsset(CHARACTER_MODULES[model]),
      ...ACCESSORY_LIST.map((name) =>
        readAsset(ACCESSORY_MODULES[name]).catch((err: unknown) => {
          console.warn(`[character] accessory ${name} unavailable:`, err);
          return null;
        }),
      ),
    ]);
    const accessoryFiles = new Map<string, CharacterFile>();
    accessories.forEach((file, i) => {
      if (file) accessoryFiles.set(ACCESSORY_LIST[i], file);
    });
    const stage = new CharacterStage(character, accessoryFiles, { voiceLevel: currentVoiceLevel });
    readyStages.set(model, stage);
    if (lastLook?.model === model) setCharacterLook(lastLook);
    return stage;
  })();
  loading.set(model, promise);
  promise.catch(() => {
    loading.delete(model); // a later mount may retry
  });
  return promise;
}

/** A model's stage, if it has loaded already (a later view shows it in its first frame). */
export function loadedCharacterStage(model: CharacterModelRef = DEFAULT_CHARACTER_MODEL): CharacterStage | null {
  return readyStages.get(model) ?? null;
}

/** The companion's look (its model's stage wears it; a stage loaded later puts it on). */
export function setCharacterLook(look: CompanionLook): void {
  lastLook = look;
  const stage = readyStages.get(look.model);
  if (!stage) return;
  stage.applyLook(look);
  if (!look.accessories.some(isCustomAssetRef)) return;
  // The family's own accessories load on first wear, then show (if still worn).
  void addCustomAccessories(stage, look.accessories, customAssetBytes).then(() => {
    if (lastLook === look) stage.applyLook(look);
  });
}

/**
 * Play a trick on a stage, fitted to its model first (bones it lacks drop out,
 * values stay in its limits); resolves when it ends.
 */
export function playCharacterTrick(
  stage: CharacterStage,
  model: CharacterModelRef,
  script: MotionScript,
  isReducedMotion: boolean,
): Promise<TrickOutcome> {
  // A custom avatar is fitted to the bones its file really has.
  const described = characterModelFor(model);
  const target = isCustomAssetRef(model) ? withRigBones(described, stage.boneNames) : described;
  const fitted = fitMotionScript(script, target).script;
  return stage.playOnce(buildMotionClip(fitted, stage.motionRig), isReducedMotion);
}

/** Route the jaw to this view's voice level; returns the undo. */
export function routeVoiceLevel(voiceLevel: () => number): () => void {
  activeVoiceLevel = voiceLevel;
  return () => {
    if (activeVoiceLevel === voiceLevel) activeVoiceLevel = () => 0;
  };
}

/**
 * A renderer for a GLView's context, sized to its drawing buffer (expo-gl
 * fixes the buffer when the context is created; a resized view needs a new one).
 */
export function createCharacterRenderer(gl: ExpoWebGLRenderingContext): CharacterRenderer {
  // expo-gl implements only UNPACK_FLIP_Y_WEBGL and UNPACK_ALIGNMENT and logs
  // for the rest, which three sets on every texture upload (premultiply,
  // colorspace conversion: both off for these textures anyway).
  const pixelStorei = gl.pixelStorei.bind(gl);
  gl.pixelStorei = (pname: GLenum, param: GLint | GLboolean) => {
    if (pname === gl.UNPACK_FLIP_Y_WEBGL || pname === gl.UNPACK_ALIGNMENT) pixelStorei(pname, param);
  };
  return rendererForContext(gl, gl.drawingBufferWidth, gl.drawingBufferHeight);
}
