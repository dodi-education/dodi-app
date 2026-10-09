/**
 * Checks a character or accessory .glb against the character format
 * (characters/README.md) before it is sealed and stored: a TypeScript port of
 * `characters/validate.py`, the reference, with the same checks, budgets and
 * messages. Pure (no three.js, no DOM, no Node APIs), so the CLI, the apps and
 * a server-side publication path share it.
 *
 * Beyond validate.py, which only ever reads the stock files, it also refuses
 * what an uploaded file could do to the app: broken or truncated containers,
 * buffers or images that point outside the file (a loader would fetch them),
 * textures other than embedded PNGs (the app decodes only those in script)
 * and required glTF extensions (the app's loader has none). It counts
 * non-indexed triangles too, so the budget cannot be dodged.
 */

export type CharacterAssetKind = "avatar" | "accessory";

export interface CharacterAssetInfo {
  triangles: number;
  /** File size in bytes. */
  bytes: number;
  /** Longest side of the largest embedded PNG texture, in pixels (0: none). */
  maxTexture: number;
  /** Skin joint names. */
  bones: string[];
  /** Socket nodes an avatar offers (`socket_*`). */
  sockets: string[];
  /** The socket an accessory rides on (from its manifest). */
  socket?: string;
  /** Animation names. */
  clips: string[];
  /** Material names. */
  materials: string[];
}

export interface CharacterAssetReport {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  info: CharacterAssetInfo;
}

export const REQUIRED_BONES = ["root", "body", "neck", "head"] as const;
export const KNOWN_SOCKETS = ["socket_head_top", "socket_eyes", "socket_ears", "socket_neck", "socket_back"] as const;

/** Budgets per kind, as validate.py. */
export const CHARACTER_ASSET_LIMITS: Record<
  CharacterAssetKind,
  { maxTriangles: number; maxBytes: number; maxTexture: number }
> = {
  avatar: { maxTriangles: 20_000, maxBytes: 3 * 1024 * 1024, maxTexture: 1024 },
  accessory: { maxTriangles: 8_000, maxBytes: 1024 * 1024, maxTexture: 512 },
};

const GLB_MAGIC = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a; // "JSON"
const CHUNK_BIN = 0x004e4942; // "BIN\0"
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function objects(value: unknown): JsonObject[] {
  return list(value).map((item) => (isObject(item) ? item : {}));
}

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** Python's repr-ish rendering of a value in a message (None for missing). */
function show(value: unknown): string {
  if (value === undefined || value === null) return "None";
  return typeof value === "string" ? value : JSON.stringify(value);
}

function decodeUtf8(bytes: Uint8Array): string {
  if (typeof TextDecoder !== "undefined") return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  let out = "";
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i++];
    let code: number;
    if (b < 0x80) code = b;
    else if (b >= 0xc0 && b < 0xe0) code = ((b & 0x1f) << 6) | (bytes[i++] & 0x3f);
    else if (b >= 0xe0 && b < 0xf0) code = ((b & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
    else
      code =
        ((b & 0x07) << 18) | ((bytes[i++] & 0x3f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
    out += String.fromCodePoint(code);
  }
  return out;
}

/** A JSON value that may be a JSON string (Blender stores manifests as strings). */
function parseManifest(raw: unknown): { value: unknown; isBroken: boolean } {
  if (typeof raw !== "string") return { value: raw, isBroken: false };
  try {
    return { value: JSON.parse(raw) as unknown, isBroken: false };
  } catch {
    return { value: undefined, isBroken: true };
  }
}

interface Glb {
  doc: JsonObject;
  /** The BIN chunk, if any. */
  bin: Uint8Array | null;
}

function readGlb(bytes: Uint8Array): Glb | string {
  if (bytes.length < 20) return "not a glTF 2.0 binary (.glb)";
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = view.getUint32(0, true);
  const version = view.getUint32(4, true);
  const length = view.getUint32(8, true);
  if (magic !== GLB_MAGIC || version !== 2) return "not a glTF 2.0 binary (.glb)";
  if (length > bytes.length) return `file is truncated (${bytes.length} of ${length} bytes)`;
  const jsonLength = view.getUint32(12, true);
  const jsonType = view.getUint32(16, true);
  if (jsonType !== CHUNK_JSON) return "first chunk is not JSON";
  if (20 + jsonLength > length) return "file is truncated (the JSON chunk runs past the end)";
  let doc: unknown;
  try {
    doc = JSON.parse(decodeUtf8(bytes.subarray(20, 20 + jsonLength)));
  } catch {
    return "the JSON chunk is not valid JSON";
  }
  if (!isObject(doc)) return "the JSON chunk is not a glTF document";
  // The BIN chunk follows the JSON chunk (validate.py: 20 + json_len + 8).
  let bin: Uint8Array | null = null;
  const binHeader = 20 + jsonLength;
  if (binHeader + 8 <= length) {
    const binLength = view.getUint32(binHeader, true);
    const binType = view.getUint32(binHeader + 4, true);
    if (binType === CHUNK_BIN) {
      if (binHeader + 8 + binLength > length) return "file is truncated (the binary chunk runs past the end)";
      bin = bytes.subarray(binHeader + 8, binHeader + 8 + binLength);
    }
  }
  return { doc, bin };
}

function pngSize(blob: Uint8Array): [number, number] | null {
  if (blob.length < 24 || PNG_SIGNATURE.some((b, i) => blob[i] !== b)) return null;
  const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
  return [view.getUint32(16, false), view.getUint32(20, false)];
}

function triangleCount(doc: JsonObject): number {
  const accessors = objects(doc.accessors);
  let count = 0;
  for (const mesh of objects(doc.meshes)) {
    for (const prim of objects(mesh.primitives)) {
      if ((prim.mode ?? 4) !== 4) continue;
      const indices = typeof prim.indices === "number" ? accessors[prim.indices] : undefined;
      const position = isObject(prim.attributes) ? prim.attributes.POSITION : undefined;
      const source = indices ?? (typeof position === "number" ? accessors[position] : undefined);
      const n = source?.count;
      if (typeof n === "number" && n > 0) count += Math.floor(n / 3);
    }
  }
  return count;
}

interface ImageCheck {
  errors: string[];
  maxTexture: number;
}

function checkImages(doc: JsonObject, bin: Uint8Array | null, limit: number): ImageCheck {
  const errors: string[] = [];
  let maxTexture = 0;
  const views = objects(doc.bufferViews);
  for (const img of objects(doc.images)) {
    const name = show(img.name);
    if (typeof img.uri === "string" || typeof img.bufferView !== "number") {
      errors.push(`image '${name}' is not embedded in the file`);
      continue;
    }
    if (img.mimeType !== "image/png") {
      errors.push(`image '${name}' is ${show(img.mimeType)}; only PNG textures are supported`);
      continue;
    }
    const view = views[img.bufferView];
    const start = typeof view?.byteOffset === "number" ? view.byteOffset : 0;
    const dims = bin ? pngSize(bin.subarray(start, start + 32)) : null;
    if (!dims) {
      errors.push(`image '${name}' is not a readable PNG`);
      continue;
    }
    maxTexture = Math.max(maxTexture, dims[0], dims[1]);
    if (Math.max(...dims) > limit) {
      errors.push(`image '${name}' is ${dims[0]}x${dims[1]}, over ${limit}px`);
    }
  }
  return { errors, maxTexture };
}

/** What an uploaded file could make a loader fetch or need: refused. */
function containerErrors(doc: JsonObject): string[] {
  const errors: string[] = [];
  objects(doc.buffers).forEach((buffer, i) => {
    if (typeof buffer.uri === "string") errors.push(`buffer ${i} points outside the file (uri); embed it in the .glb`);
  });
  const required = list(doc.extensionsRequired).filter((e): e is string => typeof e === "string");
  if (required.length > 0) errors.push(`requires glTF extensions the app can't load: ${required.join(", ")}`);
  return errors;
}

function materialWarnings(doc: JsonObject): string[] {
  return objects(doc.materials)
    .filter((m) => {
      const extras = isObject(m.extras) ? m.extras : {};
      return !extras.unlit && !("shade_color" in extras);
    })
    .map((m) => `material '${show(m.name)}' has no shade_color (renderer will derive one)`);
}

function isNear(values: unknown, target: readonly number[], tolerance: number): boolean {
  const v = list(values);
  // Python's zip: compares as many components as both have.
  return target.every((t, i) => i >= v.length || typeof v[i] !== "number" || Math.abs((v[i] as number) - t) <= tolerance);
}

function baseInfo(doc: JsonObject, bytes: number): CharacterAssetInfo {
  const nodes = objects(doc.nodes);
  const bones: string[] = [];
  for (const skin of objects(doc.skins)) {
    for (const j of list(skin.joints)) {
      const name = typeof j === "number" ? str(nodes[j]?.name) : undefined;
      if (name !== undefined && !bones.includes(name)) bones.push(name);
    }
  }
  return {
    triangles: triangleCount(doc),
    bytes,
    maxTexture: 0,
    bones,
    sockets: [],
    clips: objects(doc.animations).map((a) => str(a.name) ?? ""),
    materials: objects(doc.materials).map((m) => str(m.name) ?? ""),
  };
}

function checkAccessory(doc: JsonObject, bin: Uint8Array | null, manifest: JsonObject, bytes: number): CharacterAssetReport {
  const limits = CHARACTER_ASSET_LIMITS.accessory;
  const errors: string[] = [];
  const warnings: string[] = materialWarnings(doc);
  const nodes = objects(doc.nodes);
  if (manifest.format !== "accessory") errors.push('the "accessory" manifest has no format "accessory"');
  const socket = manifest.socket;
  if (!(KNOWN_SOCKETS as readonly unknown[]).includes(socket)) {
    errors.push(`socket '${show(socket)}' is not one of ${KNOWN_SOCKETS.join(", ")}`);
  }
  const attach = nodes.find((n) => n.name === "attach");
  if (!attach) {
    errors.push("no 'attach' node (the point that goes on the socket)");
  } else {
    const isMoved = !isNear(attach.translation ?? [0, 0, 0], [0, 0, 0], 1e-5);
    const isTurned = !isNear(attach.rotation ?? [0, 0, 0, 1], [0, 0, 0, 1], 1e-5);
    if (isMoved || isTurned || "matrix" in attach) {
      errors.push("'attach' must sit at the accessory's origin with no rotation");
    }
  }
  if (list(doc.skins).length > 0 || list(doc.animations).length > 0) {
    warnings.push("accessories are static in format v1; skins and animations are ignored");
  }
  const info = baseInfo(doc, bytes);
  if (typeof socket === "string") info.socket = socket;
  if (info.triangles > limits.maxTriangles) {
    errors.push(`${info.triangles} triangles exceeds the accessory budget of ${limits.maxTriangles}`);
  }
  if (bytes > limits.maxBytes) {
    errors.push(
      `file is ${Math.round(bytes / 1024)} KB, over the accessory budget of ${Math.floor(limits.maxBytes / 1024)} KB`,
    );
  }
  const images = checkImages(doc, bin, limits.maxTexture);
  errors.push(...images.errors, ...containerErrors(doc));
  info.maxTexture = images.maxTexture;
  return { isValid: errors.length === 0, errors, warnings, info };
}

function checkAvatar(doc: JsonObject, bin: Uint8Array | null, rawManifest: unknown, bytes: number): CharacterAssetReport {
  const limits = CHARACTER_ASSET_LIMITS.avatar;
  const errors: string[] = [];
  const warnings: string[] = [];
  const nodes = objects(doc.nodes);
  // validate.py's `names` dict: name → last index, in order of first appearance.
  const names = new Map<string, number>();
  nodes.forEach((n, i) => names.set(str(n.name) ?? "", i));
  const parent = new Map<number, number>();
  nodes.forEach((n, i) => {
    for (const c of list(n.children)) if (typeof c === "number") parent.set(c, i);
  });

  // Manifest
  const parsed = parseManifest(rawManifest);
  let manifest: JsonObject = {};
  if (isObject(parsed.value) && parsed.value.format === "character") {
    manifest = parsed.value;
  } else {
    errors.push(
      parsed.isBroken ? 'the "character" manifest is not valid JSON' : 'scene extras lack the "character" manifest',
    );
  }

  // Skeleton
  const info = baseInfo(doc, bytes);
  const joints = new Set(info.bones);
  const boneNodes = new Set([...names.keys()].filter((name) => joints.has(name)));
  for (const bone of REQUIRED_BONES) {
    if (!names.has(bone)) errors.push(`missing required bone '${bone}'`);
  }
  for (const skin of objects(doc.skins)) {
    for (const j of list(skin.joints)) {
      const node = typeof j === "number" ? nodes[j] : undefined;
      if (node?.rotation && !isNear(node.rotation, [0, 0, 0, 1], 1e-4)) {
        warnings.push(`bone '${show(node.name)}' has a non-identity rest rotation`);
      }
    }
  }

  // Sockets must hang off a bone so accessories follow the animation.
  const sockets = [...names.keys()].filter((n) => n.startsWith("socket_"));
  for (const s of sockets) {
    const p = parent.get(names.get(s) ?? -1);
    const parentName = p === undefined ? undefined : str(nodes[p]?.name);
    if (parentName === undefined || !boneNodes.has(parentName)) errors.push(`socket '${s}' is not parented to a bone`);
    if (!(KNOWN_SOCKETS as readonly string[]).includes(s)) warnings.push(`unknown socket '${s}'`);
  }
  for (const s of list(manifest.sockets)) {
    if (typeof s !== "string" || !names.has(s)) errors.push(`manifest lists socket '${show(s)}' but no node has that name`);
  }
  info.sockets = sockets;

  // Face states: the default is the base shape, every other state a morph
  // target "<part>_<state>" on the face mesh.
  const face = isObject(manifest.face) ? manifest.face : {};
  const targets = new Set<string>();
  for (const m of objects(doc.meshes)) {
    const extras = isObject(m.extras) ? m.extras : {};
    for (const t of list(extras.targetNames)) if (typeof t === "string") targets.add(t);
  }
  const defaults = isObject(face.default) ? face.default : {};
  for (const part of ["eyes", "mouth"] as const) {
    const states = list(face[part]);
    const fallback = defaults[part];
    if (states.length > 0 && !states.includes(fallback)) {
      errors.push(`default ${part} state '${show(fallback)}' is not listed`);
    }
    for (const state of states) {
      if (state !== fallback && !targets.has(`${part}_${show(state)}`)) {
        errors.push(`face state ${part}/${show(state)} has no morph target '${part}_${show(state)}'`);
      }
    }
  }
  for (const m of objects(doc.meshes)) {
    if (list(m.weights).some((w) => w !== 0)) {
      errors.push(`mesh '${show(m.name)}' has non-zero default morph weights; the rest face must be the default`);
    }
  }

  // Clips
  if (!info.clips.includes("idle")) errors.push("no 'idle' animation");
  for (const anim of objects(doc.animations)) {
    const isFaceSet = objects(anim.channels).some((c) => isObject(c.target) && c.target.path === "weights");
    if (targets.size > 0 && !isFaceSet) warnings.push(`clip '${show(anim.name)}' does not set the facial expression`);
  }
  for (const c of list(manifest.clips)) {
    if (typeof c !== "string" || !info.clips.includes(c)) {
      errors.push(`manifest lists clip '${show(c)}' but the file has no such animation`);
    }
  }
  const jaw = isObject(manifest.jaw) ? manifest.jaw.bone : undefined;
  if (jaw && (typeof jaw !== "string" || !names.has(jaw))) errors.push(`jaw bone '${show(jaw)}' not found`);
  for (const spring of list(manifest.springs)) {
    if (typeof spring !== "string" || !names.has(spring)) errors.push(`spring bone '${show(spring)}' not found`);
  }

  // Materials and budgets
  warnings.push(...materialWarnings(doc));
  if (info.triangles > limits.maxTriangles) {
    errors.push(`${info.triangles} triangles exceeds the ${limits.maxTriangles} budget`);
  }
  if (bytes > limits.maxBytes) {
    errors.push(`file is ${(bytes / 1e6).toFixed(1)} MB, over the ${Math.round(limits.maxBytes / 1e6)} MB budget`);
  }
  const images = checkImages(doc, bin, limits.maxTexture);
  errors.push(...images.errors, ...containerErrors(doc));
  info.maxTexture = images.maxTexture;
  return { isValid: errors.length === 0, errors, warnings, info };
}

function emptyInfo(bytes: number): CharacterAssetInfo {
  return { triangles: 0, bytes, maxTexture: 0, bones: [], sockets: [], clips: [], materials: [] };
}

/**
 * Check a .glb as an avatar (a whole character) or an accessory (a prop that
 * rides on a socket). Never throws: a file that can't be read is invalid.
 */
export function validateCharacterAsset(bytes: Uint8Array, kind: CharacterAssetKind): CharacterAssetReport {
  const glb = readGlb(bytes);
  if (typeof glb === "string") {
    return { isValid: false, errors: [glb], warnings: [], info: emptyInfo(bytes.length) };
  }
  const { doc, bin } = glb;
  const sceneIndex = typeof doc.scene === "number" ? doc.scene : 0;
  const scene = objects(doc.scenes)[sceneIndex];
  if (!scene) {
    return { isValid: false, errors: ["the file has no scene"], warnings: [], info: emptyInfo(bytes.length) };
  }
  const extras = isObject(scene.extras) ? scene.extras : {};
  const rawAccessory = extras.accessory;

  if (kind === "accessory") {
    const parsed = parseManifest(rawAccessory);
    const report = checkAccessory(doc, bin, isObject(parsed.value) ? parsed.value : {}, bytes.length);
    if (rawAccessory === undefined || rawAccessory === null) {
      report.errors.unshift(
        extras.character !== undefined
          ? "this is a character, not an accessory"
          : 'scene extras lack the "accessory" manifest',
      );
    } else if (parsed.isBroken) {
      report.errors.unshift('the "accessory" manifest is not valid JSON');
    }
    report.isValid = report.errors.length === 0;
    return report;
  }

  const report = checkAvatar(doc, bin, extras.character, bytes.length);
  if (rawAccessory !== undefined && rawAccessory !== null) {
    report.errors.unshift("this is an accessory, not a character");
    report.isValid = false;
  }
  return report;
}
