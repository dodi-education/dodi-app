/**
 * The 3D companion's platform side on the app: the character files bundled as
 * assets (expo-asset, read with expo-file-system and parsed by
 * @dodi/character, which decodes their PNG textures in script) and a three.js
 * renderer on an expo-gl context (GL ES 3, which three drives as WebGL 2).
 * The scene logic (poses, clips, toon shading, outlines) is @dodi/character's.
 */
import { Asset } from "expo-asset";
import { File } from "expo-file-system";
import type { ExpoWebGLRenderingContext } from "expo-gl";
import {
  ACCESSORY_NAMES,
  CharacterStage,
  parseCharacterFile,
  rendererForContext,
  type AccessoryName,
  type CharacterFile,
} from "@dodi/character";

// The same files the web serves from clients/web/public/characters (the
// character pipeline writes both copies; core/character's tests compare them).
// Metro bundles assets through require (glb is in metro.config.js assetExts).
/* eslint-disable @typescript-eslint/no-require-imports */
const CHARACTER_MODULE: number = require("../../assets/characters/dodi.glb");
const ACCESSORY_MODULES: Record<AccessoryName, number> = {
  headphones: require("../../assets/characters/accessories/headphones.glb"),
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

let loading: Promise<CharacterStage> | null = null;
let readyStage: CharacterStage | null = null;

/**
 * The one stage of the app session: the character and its accessories, loaded
 * once. Views share it, so a view that replaces another carries the clip on.
 */
export function loadCharacterStage(): Promise<CharacterStage> {
  loading ??= (async () => {
    const [character, ...accessories] = await Promise.all([
      readAsset(CHARACTER_MODULE),
      ...ACCESSORY_NAMES.map((name) => readAsset(ACCESSORY_MODULES[name])),
    ]);
    const accessoryFiles = new Map<string, CharacterFile>(accessories.map((file, i) => [ACCESSORY_NAMES[i], file]));
    readyStage = new CharacterStage(character, accessoryFiles, { voiceLevel: currentVoiceLevel });
    return readyStage;
  })();
  loading.catch(() => {
    loading = null; // a later mount may retry
  });
  return loading;
}

/** The stage, if it has loaded already (a later view shows it in its first frame). */
export function loadedCharacterStage(): CharacterStage | null {
  return readyStage;
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
