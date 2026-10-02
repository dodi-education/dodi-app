import * as THREE from "three";
import { GLTFLoader, type GLTFLoaderPlugin, type GLTFParser } from "three/examples/jsm/loaders/GLTFLoader.js";

import { decodePng } from "./png-decode";

/**
 * Character files (format v1, characters/README.md) from their bytes, for
 * runtimes where three's own image loading cannot work: it hands embedded
 * images to an <img> or createImageBitmap, which React Native and Node lack.
 * Here PNGs are decoded in script into data textures instead. Browsers load
 * the files by URL with three's GLTFLoader as usual.
 */

/** The accessories every character can wear, by name (their files ship with the app). */
export const ACCESSORY_NAMES = ["headphones"] as const;
export type AccessoryName = (typeof ACCESSORY_NAMES)[number];

/** What a loaded character file provides to the stage. */
export interface CharacterFile {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
}

// glTF sampler enums (WebGL constants) to three's.
const MAG_FILTERS: Record<number, THREE.MagnificationTextureFilter> = {
  9728: THREE.NearestFilter,
  9729: THREE.LinearFilter,
};
const MIN_FILTERS: Record<number, THREE.MinificationTextureFilter> = {
  9728: THREE.NearestFilter,
  9729: THREE.LinearFilter,
  9984: THREE.NearestMipmapNearestFilter,
  9985: THREE.LinearMipmapNearestFilter,
  9986: THREE.NearestMipmapLinearFilter,
  9987: THREE.LinearMipmapLinearFilter,
};
const WRAPPINGS: Record<number, THREE.Wrapping> = {
  33071: THREE.ClampToEdgeWrapping,
  33648: THREE.MirroredRepeatWrapping,
  10497: THREE.RepeatWrapping,
};

interface TextureDef {
  source?: number;
  sampler?: number;
  name?: string;
}
interface ImageDef {
  bufferView?: number;
  mimeType?: string;
  name?: string;
}
interface SamplerDef {
  magFilter?: number;
  minFilter?: number;
  wrapS?: number;
  wrapT?: number;
}

function entry<T>(json: unknown, key: string, index: number | undefined): T | undefined {
  if (index === undefined || typeof json !== "object" || json === null) return undefined;
  const list: unknown = (json as Record<string, unknown>)[key];
  return Array.isArray(list) ? (list[index] as T | undefined) : undefined;
}

/** A GLTFLoader plugin that decodes embedded PNG textures in script. */
class ScriptPngTextures implements GLTFLoaderPlugin {
  readonly name = "script_png_textures";

  constructor(private readonly parser: GLTFParser) {}

  loadTexture(textureIndex: number): Promise<THREE.Texture> | null {
    const json: unknown = this.parser.json;
    const textureDef = entry<TextureDef>(json, "textures", textureIndex);
    const imageDef = entry<ImageDef>(json, "images", textureDef?.source);
    if (!textureDef || imageDef?.bufferView === undefined || imageDef.mimeType !== "image/png") return null;
    const sampler = entry<SamplerDef>(json, "samplers", textureDef.sampler) ?? {};

    const bufferView: Promise<unknown> = this.parser.getDependency("bufferView", imageDef.bufferView);
    return bufferView.then((buffer) => {
      if (!(buffer instanceof ArrayBuffer)) throw new Error("glTF: image buffer view is not an ArrayBuffer");
      const image = decodePng(new Uint8Array(buffer));
      const texture = new THREE.DataTexture(image.data, image.width, image.height, THREE.RGBAFormat);
      texture.flipY = false; // glTF's UV origin, as GLTFLoader sets it
      texture.name = textureDef.name ?? imageDef.name ?? "";
      texture.magFilter = MAG_FILTERS[sampler.magFilter ?? -1] ?? THREE.LinearFilter;
      texture.minFilter = MIN_FILTERS[sampler.minFilter ?? -1] ?? THREE.LinearMipmapLinearFilter;
      texture.wrapS = WRAPPINGS[sampler.wrapS ?? -1] ?? THREE.RepeatWrapping;
      texture.wrapT = WRAPPINGS[sampler.wrapT ?? -1] ?? THREE.RepeatWrapping;
      texture.generateMipmaps = texture.minFilter !== THREE.NearestFilter && texture.minFilter !== THREE.LinearFilter;
      texture.needsUpdate = true;
      this.parser.associations.set(texture, { textures: textureIndex });
      return texture;
    });
  }
}

/** Parse a character or accessory .glb from its bytes, textures decoded in script. */
export async function parseCharacterFile(bytes: ArrayBuffer): Promise<CharacterFile> {
  const loader = new GLTFLoader();
  loader.register((parser) => new ScriptPngTextures(parser));
  const gltf = await loader.parseAsync(bytes, "");
  return { scene: gltf.scene, animations: gltf.animations };
}
