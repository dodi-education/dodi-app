import * as THREE from "three";

import { ACCESSORIES, isAccessoryName } from "./character-catalog";
import type { CharacterFile } from "./character-files";
import { shadeFor } from "./character-look";
import type { CharacterPose } from "./character-pose";
import { CharacterView } from "./character-view";
import { HullOutline, isOutlineHull } from "./hull-outline";
import type { MotionRig } from "./motion-clip";
import { OutlinePass } from "./outline-pass";
import { characterMaterial } from "./toon-materials";

/**
 * The 3D companion's scene: the character with its accessories, toon
 * materials, outlines, clips cross-fading between poses, the voice jaw and the
 * orthographic camera. Platform-free: the client owns the drawing surface and
 * the renderer, sizes the stage (`layout`), drives time (`update`) and draws
 * (`render`). One stage can outlive several renderers (the web moves its one
 * canvas between views; the app makes a GL context per view).
 * Format: characters/README.md.
 */

export const VIEW_HEIGHT = 1.2; // model units across the box's shorter side; room for the clips to move
const CAMERA_DISTANCE = 5;
const CAMERA_NEAR = 0.1;
const CAMERA_FAR = 10;
// The drawing surface reaches past the view's box, so the character is never
// cut off by it: by half the box when turned, and further as it zooms in (in
// steps, so a pinch does not reallocate the buffers every frame).
const CANVAS_MARGIN = 0.5;
const CANVAS_ZOOM_STEP = 0.5;
// Line radii in model units, measured against the 2D art (images/dodi-*.png):
// its silhouette is about 1.7% of the character's height thick, the headphones'
// lines about 1.2% outside and 0.6% inside. preview.py draws 0.0095 of a
// 1.12-unit-high frame, which reads heavier in the app.
const LINE_RADIUS = 0.0095 * 1.12 * 0.7;
const ACCESSORY_LINE_RADIUS = LINE_RADIUS * 0.6;
// The hull only draws outside the silhouette, where the edge pass's line is
// centred on the edge: about as heavy at 1.5 radii.
const HULL_THICKNESS = LINE_RADIUS * 1.5;
const ACCESSORY_HULL_THICKNESS = ACCESSORY_LINE_RADIUS * 1.5;

const CROSS_FADE_SECONDS = 0.35;
const JAW_SMOOTHING = 0.35; // per frame, towards the voice level
const JAW_AXIS = new THREE.Vector3(1, 0, 0); // positive opens

/**
 * How the lines are drawn: `edges` (the part-ID edge pass, as the previews),
 * `hull` (inverted hull, for renderers the edge pass fails on) or `none`.
 */
export type OutlineMode = "edges" | "hull" | "none";

/** The surface's size: the view's box and the drawing surface around it (CSS px / points), and its buffer. */
export interface StageLayout {
  boxWidth: number;
  boxHeight: number;
  canvasWidth: number;
  canvasHeight: number;
  /** Drawing-buffer size in pixels. */
  bufferWidth: number;
  bufferHeight: number;
  /** Buffer pixels per CSS px / point. */
  pixelRatio: number;
}

export interface StageOptions {
  outline?: OutlineMode;
  /** The voice's loudness right now, 0..1 (the jaw follows it while talking). */
  voiceLevel?: () => number;
}

interface CharacterManifest {
  outlineColor: string;
  jawOpenDegrees: number;
  /** Model units from the feet to the top of the head. */
  height: number;
}

// Where flips turn about, as a share of the height: about the belly.
const CENTER_OF_HEIGHT = 0.45;

function readManifest(root: THREE.Object3D): CharacterManifest {
  const raw: unknown = root.userData.character;
  const fallback: CharacterManifest = { outlineColor: "#34506a", jawOpenDegrees: 14, height: 1 };
  if (typeof raw !== "string") return fallback;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return fallback;
    const outline = (parsed as { outline?: { color?: unknown } }).outline;
    const jaw = (parsed as { jaw?: { open_degrees?: unknown } }).jaw;
    const height = (parsed as { height?: unknown }).height;
    return {
      outlineColor: typeof outline?.color === "string" ? outline.color : fallback.outlineColor,
      jawOpenDegrees: typeof jaw?.open_degrees === "number" ? jaw.open_degrees : fallback.jawOpenDegrees,
      height: typeof height === "number" && height > 0 ? height : fallback.height,
    };
  } catch {
    return fallback;
  }
}

function readAccessorySocket(root: THREE.Object3D): string | null {
  const raw: unknown = root.userData.accessory;
  if (typeof raw !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    const socket = (parsed as { socket?: unknown } | null)?.socket;
    return typeof socket === "string" ? socket : null;
  } catch {
    return null;
  }
}

/** How far the drawing surface reaches past the view's box at a zoom (a factor of the box). */
export function canvasScaleFor(zoom: number): number {
  return CANVAS_MARGIN + Math.ceil(zoom / CANVAS_ZOOM_STEP) * CANVAS_ZOOM_STEP;
}

/** Visible along with every ancestor (a hidden accessory hides its meshes). */
function isShown(obj: THREE.Object3D): boolean {
  for (let node: THREE.Object3D | null = obj; node; node = node.parent) {
    if (!node.visible) return false;
  }
  return true;
}

/** How a trick ended: played through, cut short (another trick, reduced motion), or not played. */
export type TrickOutcome = "done" | "interrupted" | "reduced-motion";

/** What the kid made of the character: material base colors and worn accessories. */
export interface StageLook {
  /** Material name → base color (#rrggbb); the shadow tone is derived. */
  colors: Readonly<Record<string, string>>;
  accessories: readonly string[];
}

interface ToonColors {
  base: THREE.Color;
  shade: THREE.Color;
}

interface PlayingTrick {
  action: THREE.AnimationAction;
  resolve: (outcome: TrickOutcome) => void;
}

/** Bone names as authored: GLTFLoader suffixes duplicates (`head_1` when a mesh is also `head`). */
function authoredBoneName(name: string, isTaken: (base: string) => boolean): string {
  const match = /^(.*)_\d+$/.exec(name);
  return match && !isTaken(match[1]) ? match[1] : name;
}

/** The result of `setPose`, for the clients' diagnostics. */
export interface PoseChange {
  /** The clip now playing (null: the file has neither the clip nor `idle`). */
  clip: string | null;
  isChanged: boolean;
  /** Why it is unchanged: the pose already shows, the file lacks the clip, or it plays already. */
  unchangedBecause?: "same-pose" | "no-clip" | "same-action";
}

export class CharacterStage {
  readonly view = new CharacterView();
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, CAMERA_NEAR, CAMERA_FAR);
  readonly character: THREE.Object3D;
  readonly clipNames: readonly string[];

  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private readonly accessories = new Map<string, THREE.Object3D>();
  private readonly outlined: { mesh: THREE.Mesh; isFine: boolean }[] = [];
  private readonly jaw: THREE.Bone | null;
  private readonly jawOpen: number;
  private readonly lineColor: THREE.Color;
  private readonly outline: OutlinePass;
  private readonly raycaster = new THREE.Raycaster();
  private readonly voiceLevel: () => number;

  private readonly toonMaterials = new Map<string, { materials: THREE.ShaderMaterial[]; original: ToonColors }>();
  private readonly rig: MotionRig;

  private hull: HullOutline | null = null;
  private outlineMode: OutlineMode;
  private current: THREE.AnimationAction | null = null;
  private pose: CharacterPose | null = null;
  private look: StageLook = { colors: {}, accessories: [] };
  private trick: PlayingTrick | null = null;
  /** Trick actions fading out after their end, uncached once silent. */
  private readonly retiring = new Set<THREE.AnimationAction>();
  private isReducedMotion = false;
  private jawLevel = 0;

  constructor(character: CharacterFile, accessories: ReadonlyMap<string, CharacterFile>, options: StageOptions = {}) {
    const root = character.scene;
    const manifest = readManifest(root);
    this.lineColor = new THREE.Color(manifest.outlineColor);
    this.outline = new OutlinePass(this.lineColor, CAMERA_FAR - CAMERA_NEAR);
    this.jawOpen = THREE.MathUtils.degToRad(manifest.jawOpenDegrees);
    this.outlineMode = options.outline ?? "edges";
    this.voiceLevel = options.voiceLevel ?? (() => 0);

    for (const [name, accessory] of accessories) {
      const socketName = readAccessorySocket(accessory.scene);
      const socket = socketName ? root.getObjectByName(socketName) : undefined;
      if (!socket) continue;
      accessory.scene.visible = false;
      socket.add(accessory.scene);
      this.accessories.set(name, accessory.scene);
    }

    const accessoryMeshes = new Set<THREE.Object3D>();
    for (const accessory of this.accessories.values()) accessory.traverse((obj) => accessoryMeshes.add(obj));
    // Meshes of the character and of every accessory now hang under `root`.
    root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      obj.material = characterMaterial(obj.material as THREE.Material);
      obj.frustumCulled = false; // skinned bounds do not follow the clips
      const isFine = accessoryMeshes.has(obj);
      this.outline.add(obj, isFine);
      this.outlined.push({ mesh: obj, isFine });
      if (!isFine) this.indexToonMaterial(obj.material);
    });
    let jaw: THREE.Bone | null = null;
    root.traverse((obj) => {
      if (obj instanceof THREE.Bone && obj.name === "jaw") jaw = obj;
    });
    this.jaw = jaw;
    this.scene.add(root);
    this.character = root;

    this.rig = this.snapshotRig(root);

    this.mixer = new THREE.AnimationMixer(root);
    for (const clip of character.animations) this.actions.set(clip.name, this.mixer.clipAction(clip));
    this.clipNames = character.animations.map((clip) => clip.name);
    this.mixer.addEventListener("finished", (event) => this.onActionFinished(event.action));
    this.setOutlineMode(this.outlineMode);
  }

  /** The rig as tricks see it (motion-clip.ts): bones by authored name, their rest pose, the face. */
  get motionRig(): MotionRig {
    return this.rig;
  }

  /** Rig bone names (as authored). */
  get boneNames(): string[] {
    return [...this.rig.bones.keys()];
  }

  private snapshotRig(root: THREE.Object3D): MotionRig {
    const found: THREE.Bone[] = [];
    let face: THREE.Mesh | null = null;
    root.traverse((obj) => {
      if (obj instanceof THREE.Bone) found.push(obj);
      if (obj instanceof THREE.Mesh && obj.name === "face" && obj.morphTargetDictionary) face = obj;
    });
    const names = new Set(found.map((bone) => bone.name));
    const bones = new Map<string, THREE.Object3D>();
    const rest = new Map<string, { position: THREE.Vector3; quaternion: THREE.Quaternion }>();
    for (const bone of found) {
      const name = authoredBoneName(bone.name, (base) => names.has(base));
      bones.set(name, bone);
      rest.set(name, { position: bone.position.clone(), quaternion: bone.quaternion.clone() });
    }
    return { bones, rest, face, centerHeight: CENTER_OF_HEIGHT * readManifest(root).height };
  }

  private indexToonMaterial(material: THREE.Material | THREE.Material[]): void {
    for (const mat of Array.isArray(material) ? material : [material]) {
      if (!(mat instanceof THREE.ShaderMaterial) || !mat.uniforms.baseColor || !mat.uniforms.shadeColor) continue;
      const entry = this.toonMaterials.get(mat.name);
      if (entry) {
        if (!entry.materials.includes(mat)) entry.materials.push(mat);
        continue;
      }
      this.toonMaterials.set(mat.name, {
        materials: [mat],
        original: {
          base: (mat.uniforms.baseColor.value as THREE.Color).clone(),
          shade: (mat.uniforms.shadeColor.value as THREE.Color).clone(),
        },
      });
    }
  }

  /**
   * Show the kid's look: recolor materials (a material not in `colors` gets its
   * own colors back) and wear accessories on top of the pose's own.
   */
  applyLook(look: StageLook): void {
    this.look = { colors: { ...look.colors }, accessories: [...look.accessories] };
    for (const [name, { materials, original }] of this.toonMaterials) {
      const base = look.colors[name];
      const baseColor = base ? new THREE.Color(base) : original.base;
      const shadeColor = base
        ? new THREE.Color(shadeFor(base, `#${original.base.getHexString()}`, `#${original.shade.getHexString()}`))
        : original.shade;
      for (const material of materials) {
        (material.uniforms.baseColor.value as THREE.Color).copy(baseColor);
        (material.uniforms.shadeColor.value as THREE.Color).copy(shadeColor);
      }
    }
    this.showAccessories();
  }

  /** Base color in use per material, for tests and diagnostics. */
  materialColor(name: string): string | null {
    const entry = this.toonMaterials.get(name);
    if (!entry) return null;
    return `#${(entry.materials[0].uniforms.baseColor.value as THREE.Color).getHexString()}`;
  }

  /** Whether an accessory shows right now. */
  isAccessoryShown(name: string): boolean {
    return this.accessories.get(name)?.visible ?? false;
  }

  /** The pose's accessories plus the look's, minus those the pose's clip takes off. */
  private showAccessories(): void {
    const clip = this.pose?.clip ?? null;
    for (const [name, accessory] of this.accessories) {
      const isWorn = (this.pose?.accessories.includes(name) ?? false) || this.look.accessories.includes(name);
      const isTakenOff =
        clip !== null && isAccessoryName(name) && ACCESSORIES[name].hiddenDuringClips.includes(clip);
      accessory.visible = isWorn && !isTakenOff;
    }
  }

  /** A trick is playing. */
  get isPlayingTrick(): boolean {
    return this.trick !== null;
  }

  /**
   * Play a trick clip once, cross-faded in from the pose's loop and back into
   * it at the end. A trick cuts short the one before; reduced motion skips it.
   * Resolves when it ends.
   */
  playOnce(clip: THREE.AnimationClip, isReducedMotion: boolean): Promise<TrickOutcome> {
    if (isReducedMotion || this.isReducedMotion) return Promise.resolve("reduced-motion");
    const action = this.mixer.clipAction(clip);
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.reset().setEffectiveWeight(1).play();

    // Cut short: the trick before fades straight into this one (the loop stays out).
    const previous = this.trick;
    this.trick = null;
    const from = previous?.action ?? this.current;
    if (from && from !== action) from.crossFadeTo(action, CROSS_FADE_SECONDS, false);
    if (previous) {
      this.retiring.add(previous.action);
      previous.resolve("interrupted");
    }
    return new Promise((resolve) => {
      this.trick = { action, resolve };
    });
  }

  private onActionFinished(action: THREE.AnimationAction): void {
    if (this.trick?.action === action) this.endTrick("done");
  }

  /** Fade from the playing trick back into the pose's loop. */
  private endTrick(outcome: TrickOutcome): void {
    const trick = this.trick;
    if (!trick) return;
    this.trick = null;
    const next = (this.pose && this.actions.get(this.pose.clip)) ?? this.actions.get("idle") ?? null;
    if (next) {
      next.reset().setEffectiveWeight(1).play();
      if (outcome === "done") trick.action.crossFadeTo(next, CROSS_FADE_SECONDS, false);
      this.current = next;
    }
    if (outcome === "done" && next) this.retiring.add(trick.action);
    else this.retire(trick.action);
    trick.resolve(outcome);
  }

  private retire(action: THREE.AnimationAction): void {
    this.retiring.delete(action);
    action.stop();
    const clip = action.getClip();
    this.mixer.uncacheAction(clip);
    this.mixer.uncacheClip(clip);
  }

  get currentPose(): CharacterPose | null {
    return this.pose;
  }

  get currentClip(): string | null {
    return this.current?.getClip().name ?? null;
  }

  /** Show `pose`: its accessories, and its clip, cross-faded from the last one (cut under reduced motion). */
  setPose(pose: CharacterPose, isReducedMotion: boolean): PoseChange {
    const previous = this.pose;
    this.pose = pose;
    this.showAccessories();
    // A trick plays on; it fades into this pose's clip when it ends.
    if (this.trick) return { clip: this.currentClip, isChanged: false, unchangedBecause: "same-action" };
    if (previous?.clip === pose.clip && this.current) {
      return { clip: this.currentClip, isChanged: false, unchangedBecause: "same-pose" };
    }

    const next = this.actions.get(pose.clip) ?? this.actions.get("idle");
    if (!next || next === this.current) {
      return { clip: this.currentClip, isChanged: false, unchangedBecause: next ? "same-action" : "no-clip" };
    }
    next.reset().setEffectiveWeight(1).play();
    if (this.current && !isReducedMotion) {
      this.current.crossFadeTo(next, CROSS_FADE_SECONDS, false);
    } else {
      this.current?.stop();
    }
    this.current = next;
    // Reduced motion: hold the clip's first frame (it carries the expression).
    this.isReducedMotion = isReducedMotion;
    this.mixer.timeScale = isReducedMotion ? 0 : 1;
    this.mixer.update(0);
    return { clip: this.currentClip, isChanged: true };
  }

  /** Reduced motion turned on or off while a pose shows: hold its first frame, or play on. */
  setReducedMotion(isReducedMotion: boolean): void {
    if (isReducedMotion === this.isReducedMotion) return;
    this.isReducedMotion = isReducedMotion;
    if (isReducedMotion) this.endTrick("interrupted");
    if (isReducedMotion && this.current) {
      for (const action of this.actions.values()) if (action !== this.current) action.stop();
      this.current.reset().setEffectiveWeight(1).play();
    }
    this.mixer.timeScale = isReducedMotion ? 0 : 1;
    this.mixer.update(0);
  }

  /** Advance the clips by `deltaSeconds` (capped at 0.1) and move the jaw with the voice. */
  update(deltaSeconds: number): void {
    this.mixer.update(Math.min(deltaSeconds, 0.1));
    for (const action of this.retiring) {
      if (!action.isRunning() || action.getEffectiveWeight() === 0) this.retire(action);
    }
    this.applyVoiceJaw();
  }

  getOutlineMode(): OutlineMode {
    return this.outlineMode;
  }

  setOutlineMode(mode: OutlineMode): void {
    this.outlineMode = mode;
    if (mode === "hull" && !this.hull) {
      this.hull = new HullOutline(this.lineColor, HULL_THICKNESS, ACCESSORY_HULL_THICKNESS);
      for (const { mesh, isFine } of this.outlined) this.hull.add(mesh, isFine);
    }
    this.hull?.setVisible(mode === "hull");
  }

  /**
   * Check the edge pass on `renderer` (draws a frame); if it fails there, switch
   * to the hull. Call after the first `layout`; returns the mode in use.
   */
  chooseOutline(renderer: THREE.WebGLRenderer): OutlineMode {
    if (this.outlineMode !== "edges") return this.outlineMode;
    if (!this.outline.isSupported(renderer, this.scene, this.camera)) this.setOutlineMode("hull");
    return this.outlineMode;
  }

  /** Fit the camera and the outline buffers to the surface. The unzoomed character fills the box. */
  layout({ boxWidth, boxHeight, canvasWidth, canvasHeight, bufferWidth, bufferHeight, pixelRatio }: StageLayout): void {
    // Unzoomed, VIEW_HEIGHT fits the box's shorter side; lines keep their width when zoomed.
    const unitsPerCssPx = VIEW_HEIGHT / Math.max(1, Math.min(boxWidth, boxHeight));
    const halfW = (canvasWidth * unitsPerCssPx) / 2;
    const halfH = (canvasHeight * unitsPerCssPx) / 2;
    this.camera.left = -halfW;
    this.camera.right = halfW;
    this.camera.top = halfH;
    this.camera.bottom = -halfH;
    this.camera.updateProjectionMatrix();

    const unitsPerBufferPx = unitsPerCssPx / pixelRatio;
    this.outline.setSize(
      bufferWidth,
      bufferHeight,
      LINE_RADIUS / unitsPerBufferPx,
      ACCESSORY_LINE_RADIUS / unitsPerBufferPx,
    );
  }

  /** Draw the character to the renderer's canvas (its current render target is reset). */
  render(renderer: THREE.WebGLRenderer): void {
    this.view.apply(this.camera, CAMERA_DISTANCE);
    if (this.outlineMode === "edges") {
      this.outline.render(renderer, this.scene, this.camera);
      return;
    }
    renderer.setRenderTarget(null);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(this.scene, this.camera);
  }

  /** Whether a point of the surface (normalized device coordinates, -1..1, y up) lies on the character. */
  hitTest(ndcX: number, ndcY: number): boolean {
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    // Skinned bounds are cached; the clips have moved the mesh since.
    this.character.traverse((obj) => {
      if (obj instanceof THREE.SkinnedMesh) obj.computeBoundingSphere();
    });
    return this.raycaster
      .intersectObject(this.character, true)
      .some((hit) => isShown(hit.object) && !isOutlineHull(hit.object));
  }

  /** The playing state, for debugging (the face's morphs, the running actions). */
  debugSnapshot(): Record<string, unknown> {
    let face: THREE.Mesh | null = null;
    this.character.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.name === "face" && obj.morphTargetDictionary) face = obj;
    });
    const morphs: Record<string, number> = {};
    const faceMesh = face as THREE.Mesh | null;
    if (faceMesh?.morphTargetDictionary && faceMesh.morphTargetInfluences) {
      for (const [name, index] of Object.entries(faceMesh.morphTargetDictionary)) {
        morphs[name] = Number(faceMesh.morphTargetInfluences[index].toFixed(2));
      }
    }
    const actions = [...this.actions].map(([name, action]) => ({
      name,
      isRunning: action.isRunning(),
      isEnabled: action.enabled,
      weight: Number(action.getEffectiveWeight().toFixed(2)),
      time: Number(action.time.toFixed(2)),
    }));
    return {
      pose: this.pose?.clip ?? null,
      current: this.currentClip,
      timeScale: this.mixer.timeScale,
      morphs,
      actions: actions.filter((action) => action.isRunning || action.weight > 0),
    };
  }

  /** After the mixer, so the voice overrides the talk clip's fallback jaw. */
  private applyVoiceJaw(): void {
    if (!this.jaw) return;
    const target = this.pose?.hasVoiceJaw && this.mixer.timeScale > 0 ? this.voiceLevel() : 0;
    this.jawLevel += (target - this.jawLevel) * JAW_SMOOTHING;
    if (!this.pose?.hasVoiceJaw) return;
    this.jaw.quaternion.setFromAxisAngle(JAW_AXIS, this.jawLevel * this.jawOpen);
  }
}
