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
  CHARACTER_MODELS,
  CharacterStage,
  DEFAULT_CHARACTER_MODEL,
  buildMotionClip,
  fitMotionScript,
  parseCharacterFile,
  rendererForContext,
  type AccessoryName,
  type CharacterFile,
  type CharacterModelId,
  type CompanionLook,
  type MotionScript,
  type TrickOutcome,
} from "@dodi/character";

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
const loading = new Map<CharacterModelId, Promise<CharacterStage>>();
const readyStages = new Map<CharacterModelId, CharacterStage>();
let lastLook: CompanionLook | null = null;

/**
 * A model's stage for the app session: the character and the accessories,
 * loaded once. Views share it, so a view that replaces another carries the
 * clip on. Rejects if the model fails; an accessory that fails to load is
 * left out rather than failing the stage (web: lib/character/character-stage).
 */
export function loadCharacterStage(model: CharacterModelId = DEFAULT_CHARACTER_MODEL): Promise<CharacterStage> {
  const existing = loading.get(model);
  if (existing) return existing;
  const promise = (async () => {
    const [character, ...accessories] = await Promise.all([
      readAsset(CHARACTER_MODULES[model]),
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
    if (lastLook?.model === model) stage.applyLook(lastLook);
    readyStages.set(model, stage);
    return stage;
  })();
  loading.set(model, promise);
  promise.catch(() => {
    loading.delete(model); // a later mount may retry
  });
  return promise;
}

/** A model's stage, if it has loaded already (a later view shows it in its first frame). */
export function loadedCharacterStage(model: CharacterModelId = DEFAULT_CHARACTER_MODEL): CharacterStage | null {
  return readyStages.get(model) ?? null;
}

/** The companion's look (its model's stage wears it; a stage loaded later puts it on). */
export function setCharacterLook(look: CompanionLook): void {
  lastLook = look;
  readyStages.get(look.model)?.applyLook(look);
}

/**
 * Play a trick on a stage, fitted to its model first (bones it lacks drop out,
 * values stay in its limits); resolves when it ends.
 */
export function playCharacterTrick(
  stage: CharacterStage,
  model: CharacterModelId,
  script: MotionScript,
  isReducedMotion: boolean,
): Promise<TrickOutcome> {
  const fitted = fitMotionScript(script, CHARACTER_MODELS[model]).script;
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
