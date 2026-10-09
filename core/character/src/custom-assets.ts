import { validateCharacterAsset, type CharacterAssetKind } from "./asset-validator";
import { customAssetIdOf, type AccessoryRef } from "./character-catalog";
import { parseCharacterFile, type CharacterFile } from "./character-files";
import type { CharacterStage } from "./character-stage";

/**
 * A family's own avatars and accessories in the renderer. Their files are not
 * shipped with the app: the client fetches and decrypts them (client-state's
 * character-asset store) and hands the bytes over here. The bytes are checked
 * again before they are parsed (an asset is only trusted as far as the vault
 * that sealed it), then loaded from memory with GLTFLoader.parse, never by URL.
 */

/** Opened .glb bytes of an asset, by id (the client's store; rejects if it is gone). */
export type CustomAssetBytes = (assetId: string) => Promise<Uint8Array>;

export class CustomAssetError extends Error {
  constructor(
    readonly assetId: string,
    readonly problems: readonly string[],
  ) {
    super(`character asset ${assetId} is not a valid ${problems.join("; ")}`);
    this.name = "CustomAssetError";
  }
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

/** Validate and parse a custom asset's bytes; rejects with CustomAssetError when the file is not usable. */
export async function parseCustomAsset(
  assetId: string,
  bytes: Uint8Array,
  kind: CharacterAssetKind,
): Promise<CharacterFile> {
  const report = validateCharacterAsset(bytes, kind);
  if (!report.isValid) throw new CustomAssetError(assetId, [kind, ...report.errors]);
  return parseCharacterFile(toArrayBuffer(bytes));
}

/** Load a custom avatar (`custom:<id>`) from its bytes. */
export async function loadCustomAvatar(ref: string, getBytes: CustomAssetBytes): Promise<CharacterFile> {
  const id = customAssetIdOf(ref);
  if (id === null) throw new Error(`${ref} is not a custom asset`);
  return parseCustomAsset(id, await getBytes(id), "avatar");
}

const pending = new WeakMap<CharacterStage, Map<string, Promise<boolean>>>();

/**
 * Put the look's custom accessories on a stage (each loaded once per stage;
 * catalog ones are there already). One that fails is left off, with a warning,
 * rather than failing the stage. Resolves once all have been tried.
 */
export async function addCustomAccessories(
  stage: CharacterStage,
  accessories: readonly AccessoryRef[],
  getBytes: CustomAssetBytes,
): Promise<void> {
  let perStage = pending.get(stage);
  if (!perStage) {
    perStage = new Map();
    pending.set(stage, perStage);
  }
  const loads: Promise<boolean>[] = [];
  for (const ref of accessories) {
    const id = customAssetIdOf(ref);
    if (id === null || stage.hasAccessory(ref)) continue;
    let load = perStage.get(ref);
    if (!load) {
      const map = perStage;
      load = (async () => {
        try {
          const file = await parseCustomAsset(id, await getBytes(id), "accessory");
          return stage.addAccessory(ref, file);
        } catch (err: unknown) {
          console.warn(`[character] custom accessory ${id} unavailable:`, err);
          map.delete(ref); // a later look may retry (the asset may come back)
          return false;
        }
      })();
      perStage.set(ref, load);
    }
    loads.push(load);
  }
  await Promise.all(loads);
}
