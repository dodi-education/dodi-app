import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import { dodiOutputLevel } from "@/stores/dodi-session-store";

import { attachCharacterGestures } from "./character-gestures";
import type { CharacterPose } from "./character-pose";
import { CharacterView } from "./character-view";
import { OutlinePass } from "./outline-pass";
import { characterMaterial } from "./toon-materials";

/**
 * The 3D companion, drawn on one canvas for the whole session. Views mount it
 * into their own box; when a view swaps its figure (a new state renders a new
 * branch), the canvas moves over and the animation carries on, cross-fading
 * into the next clip instead of reloading. Format: characters/README.md.
 */

const CHARACTER_URL = "/characters/dodi.glb";
const ACCESSORY_URLS: Record<string, string> = {
  headphones: "/characters/accessories/headphones.glb",
};

const VIEW_HEIGHT = 1.2; // model units across the shorter side; room for the clips to move
const CAMERA_DISTANCE = 5;
const CAMERA_NEAR = 0.1;
const CAMERA_FAR = 10;
// Rendered at SUPERSAMPLE x the device resolution and scaled down by the
// browser, which smooths the outline's pixel steps; device ratio capped at 2.
const MAX_DEVICE_PIXEL_RATIO = 2;
const SUPERSAMPLE = 2;
// The canvas reaches past the view's box, so the character is never cut off
// by it: by half the box when turned, and further as it zooms in (in steps, so
// a pinch does not reallocate the buffers every frame). The buffer's longer
// side is capped; past it, the supersampling gives way.
const CANVAS_MARGIN = 0.5;
const CANVAS_ZOOM_STEP = 0.5;
const MAX_BUFFER_SIDE = 2048;
// Line radii in model units, measured against the 2D art (public/images/dodi-*.png):
// its silhouette is about 1.7% of the character's height thick, the headphones'
// lines about 1.2% outside and 0.6% inside. preview.py draws 0.0095 of a
// 1.12-unit-high frame, which reads heavier in the app.
const LINE_RADIUS = 0.0095 * 1.12 * 0.7;
const ACCESSORY_LINE_RADIUS = LINE_RADIUS * 0.6;

const CROSS_FADE_SECONDS = 0.35;
const JAW_SMOOTHING = 0.35; // per frame, towards the voice level
const JAW_AXIS = new THREE.Vector3(1, 0, 0); // positive opens

interface CharacterManifest {
  outlineColor: string;
  jawOpenDegrees: number;
}

function readManifest(root: THREE.Object3D): CharacterManifest {
  const raw: unknown = root.userData.character;
  const fallback: CharacterManifest = { outlineColor: "#34506a", jawOpenDegrees: 14 };
  if (typeof raw !== "string") return fallback;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return fallback;
    const outline = (parsed as { outline?: { color?: unknown } }).outline;
    const jaw = (parsed as { jaw?: { open_degrees?: unknown } }).jaw;
    return {
      outlineColor: typeof outline?.color === "string" ? outline.color : fallback.outlineColor,
      jawOpenDegrees: typeof jaw?.open_degrees === "number" ? jaw.open_degrees : fallback.jawOpenDegrees,
    };
  } catch {
    return fallback;
  }
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

class CharacterStage {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, CAMERA_NEAR, CAMERA_FAR);
  private readonly clock = new THREE.Clock();
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private readonly accessories = new Map<string, THREE.Object3D>();
  private readonly jaw: THREE.Bone | null;
  private readonly jawOpen: number;
  private readonly outline: OutlinePass;
  private readonly resizeObserver: ResizeObserver;
  private readonly character: THREE.Object3D;
  private readonly view = new CharacterView();
  private readonly raycaster = new THREE.Raycaster();

  private host: HTMLElement | null = null;
  private frame = 0;
  private current: THREE.AnimationAction | null = null;
  private pose: CharacterPose | null = null;
  private jawLevel = 0;
  private canvasScale = 0;

  constructor(character: THREE.Group, clips: THREE.AnimationClip[], accessories: Map<string, THREE.Group>) {
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.domElement.style.position = "absolute";
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.pointerEvents = "none";

    const manifest = readManifest(character);
    this.outline = new OutlinePass(new THREE.Color(manifest.outlineColor), CAMERA_FAR - CAMERA_NEAR);
    this.jawOpen = THREE.MathUtils.degToRad(manifest.jawOpenDegrees);

    for (const [name, accessory] of accessories) {
      const socketName = readAccessorySocket(accessory);
      const socket = socketName ? character.getObjectByName(socketName) : undefined;
      if (!socket) continue;
      accessory.visible = false;
      socket.add(accessory);
      this.accessories.set(name, accessory);
    }

    const accessoryMeshes = new Set<THREE.Object3D>();
    for (const accessory of this.accessories.values()) accessory.traverse((obj) => accessoryMeshes.add(obj));
    // Meshes of the character and of every accessory now hang under `character`.
    character.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      obj.material = characterMaterial(obj.material as THREE.Material);
      obj.frustumCulled = false; // skinned bounds do not follow the clips
      this.outline.add(obj, accessoryMeshes.has(obj));
    });
    let jaw: THREE.Bone | null = null;
    character.traverse((obj) => {
      if (obj instanceof THREE.Bone && obj.name === "jaw") jaw = obj;
    });
    this.jaw = jaw;
    this.scene.add(character);
    this.character = character;

    this.mixer = new THREE.AnimationMixer(character);
    for (const clip of clips) this.actions.set(clip.name, this.mixer.clipAction(clip));
    // DEBUG(sleep-eyes): temporary.
    debugStageCount += 1;
    console.info("[character] stage created", { stageNumber: debugStageCount, clips: clips.map((clip) => clip.name) });
    (window as unknown as { characterDebug?: () => unknown }).characterDebug = () => this.debugSnapshot();

    this.resizeObserver = new ResizeObserver(() => this.resize());
  }

  mount(host: HTMLElement): () => void {
    this.host = host;
    host.appendChild(this.renderer.domElement);
    this.resizeObserver.observe(host);
    // Gestures cover the view's whole area (the page around dodi), if it marks one.
    const area = host.closest<HTMLElement>("[data-character-area]") ?? host;
    const tapButton = host.closest("button");
    const detachGestures = attachCharacterGestures(area, {
      hitsCharacter: (x, y) => this.hitsCharacter(x, y),
      isOnOtherControl: (target) => {
        const control = target instanceof Element ? target.closest(OTHER_CONTROLS) : null;
        return control !== null && control !== tapButton;
      },
      reachesTapButton: (target) => target instanceof Node && tapButton?.contains(target) === true,
      tap: () => tapButton?.click(),
      orbitBy: (dx, dy) => this.view.orbitBy(dx, dy),
      zoomBy: (factor) => this.view.zoomBy(factor),
    });
    this.resize();
    this.renderFrame();
    cancelAnimationFrame(this.frame); // a view that took over before the last one let go
    this.frame = requestAnimationFrame(this.tick);
    return () => {
      detachGestures();
      if (this.host !== host) return; // another view has taken over already
      this.resizeObserver.unobserve(host);
      cancelAnimationFrame(this.frame);
      this.renderer.domElement.remove();
      this.host = null;
    };
  }

  setPose(pose: CharacterPose): void {
    const previous = this.pose;
    this.pose = pose;
    for (const [name, accessory] of this.accessories) {
      accessory.visible = pose.accessories.includes(name);
    }
    // DEBUG(sleep-eyes): temporary, remove once the sleep-with-open-eyes bug is found.
    console.info("[character] setPose", {
      requested: pose.clip,
      previous: previous?.clip ?? null,
      current: this.current?.getClip().name ?? null,
      hasRequestedClip: this.actions.has(pose.clip),
      isReducedMotion: prefersReducedMotion(),
      isMounted: this.host !== null,
    });
    if (previous?.clip === pose.clip && this.current) return;

    const next = this.actions.get(pose.clip) ?? this.actions.get("idle");
    if (!next || next === this.current) {
      console.info("[character] setPose skipped", { hasNext: next !== undefined, isSameAction: next === this.current });
      return;
    }
    next.reset().setEffectiveWeight(1).play();
    if (this.current && !prefersReducedMotion()) {
      this.current.crossFadeTo(next, CROSS_FADE_SECONDS, false);
    } else {
      this.current?.stop();
    }
    this.current = next;
    // Reduced motion: hold the clip's first frame (it carries the expression).
    this.mixer.timeScale = prefersReducedMotion() ? 0 : 1;
    this.mixer.update(0);
  }

  /** DEBUG(sleep-eyes): temporary. Call `characterDebug()` in the console. */
  private debugSnapshot(): unknown {
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
      current: this.current?.getClip().name ?? null,
      timeScale: this.mixer.timeScale,
      isMounted: this.host !== null,
      isTicking: this.frame !== 0,
      morphs,
      actions: actions.filter((action) => action.isRunning || action.weight > 0),
    };
  }

  private readonly tick = (): void => {
    this.frame = requestAnimationFrame(this.tick);
    this.renderFrame();
  };

  private renderFrame(): void {
    const delta = Math.min(this.clock.getDelta(), 0.1);
    this.mixer.update(delta);
    this.applyVoiceJaw();
    if (this.host && canvasScaleFor(this.view.zoom) !== this.canvasScale) {
      this.resize(); // draws the frame
      return;
    }
    this.view.apply(this.camera, CAMERA_DISTANCE);
    this.outline.render(this.renderer, this.scene, this.camera);
  }

  private hitsCharacter(clientX: number, clientY: number): boolean {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    const pointer = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(pointer, this.camera);
    // Skinned bounds are cached; the clips have moved the mesh since.
    this.character.traverse((obj) => {
      if (obj instanceof THREE.SkinnedMesh) obj.computeBoundingSphere();
    });
    return this.raycaster.intersectObject(this.character, true).some((hit) => isShown(hit.object));
  }

  /** After the mixer, so the voice overrides the talk clip's fallback jaw. */
  private applyVoiceJaw(): void {
    if (!this.jaw) return;
    const target = this.pose?.hasVoiceJaw && this.mixer.timeScale > 0 ? dodiOutputLevel() : 0;
    this.jawLevel += (target - this.jawLevel) * JAW_SMOOTHING;
    if (!this.pose?.hasVoiceJaw) return;
    this.jaw.quaternion.setFromAxisAngle(JAW_AXIS, this.jawLevel * this.jawOpen);
  }

  private resize(): void {
    if (!this.host) return;
    const boxWidth = Math.max(1, this.host.clientWidth);
    const boxHeight = Math.max(1, this.host.clientHeight);
    this.canvasScale = canvasScaleFor(this.view.zoom);
    const width = Math.round(boxWidth * this.canvasScale);
    const height = Math.round(boxHeight * this.canvasScale);
    const style = this.renderer.domElement.style;
    style.width = `${width}px`;
    style.height = `${height}px`;
    style.left = `${(boxWidth - width) / 2}px`;
    style.top = `${(boxHeight - height) / 2}px`;
    const pixelRatio = Math.min(
      Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO) * SUPERSAMPLE,
      MAX_BUFFER_SIDE / Math.max(width, height),
    );
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);

    // Unzoomed, VIEW_HEIGHT fits the box's shorter side; lines keep their width when zoomed.
    const unitsPerCssPx = VIEW_HEIGHT / Math.min(boxWidth, boxHeight);
    const halfW = (width * unitsPerCssPx) / 2;
    const halfH = (height * unitsPerCssPx) / 2;
    this.camera.left = -halfW;
    this.camera.right = halfW;
    this.camera.top = halfH;
    this.camera.bottom = -halfH;
    this.camera.updateProjectionMatrix();

    const buffer = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const unitsPerBufferPx = unitsPerCssPx / pixelRatio;
    this.outline.setSize(buffer.x, buffer.y, LINE_RADIUS / unitsPerBufferPx, ACCESSORY_LINE_RADIUS / unitsPerBufferPx);
    this.renderFrame();
  }
}

// Controls of the page whose presses are theirs, not a gesture.
const OTHER_CONTROLS = "button, a, input, textarea, select, label, [role='button']";

function canvasScaleFor(zoom: number): number {
  return CANVAS_MARGIN + Math.ceil(zoom / CANVAS_ZOOM_STEP) * CANVAS_ZOOM_STEP;
}

/** Visible along with every ancestor (a hidden accessory hides its meshes). */
function isShown(obj: THREE.Object3D): boolean {
  for (let node: THREE.Object3D | null = obj; node; node = node.parent) {
    if (!node.visible) return false;
  }
  return true;
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

let stage: CharacterStage | null = null;
let debugStageCount = 0; // DEBUG(sleep-eyes): temporary.
let loading: Promise<void> | null = null;

/** Load the character and its accessories once; rejects if WebGL or the files fail. */
export function loadCharacterStage(): Promise<void> {
  loading ??= (async () => {
    const loader = new GLTFLoader();
    const [character, ...accessories] = await Promise.all([
      loader.loadAsync(CHARACTER_URL),
      ...Object.values(ACCESSORY_URLS).map((url) => loader.loadAsync(url)),
    ]);
    const names = Object.keys(ACCESSORY_URLS);
    // Each glTF scene group carries its file's manifest (scene extras) in userData.
    const accessoryScenes = new Map(accessories.map((gltf, i) => [names[i], gltf.scene]));
    stage = new CharacterStage(character.scene, character.animations, accessoryScenes);
  })();
  loading.catch(() => {
    loading = null; // a later mount may retry
  });
  return loading;
}

export function isCharacterStageReady(): boolean {
  return stage !== null;
}

/** Show the character in `host` (replacing wherever it was); returns the unmount. */
export function mountCharacterStage(host: HTMLElement): () => void {
  if (!stage) throw new Error("character stage not loaded");
  return stage.mount(host);
}

export function setCharacterPose(pose: CharacterPose): void {
  stage?.setPose(pose);
}
