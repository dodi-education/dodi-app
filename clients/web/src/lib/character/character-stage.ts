import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import {
  ACCESSORIES,
  ACCESSORY_LIST,
  DEFAULT_CHARACTER_MODEL,
  characterModelFor,
  isCustomAssetRef,
  withRigBones,
  type CharacterModelRef,
} from "@dodi/character/character-catalog";
import type { CharacterFile } from "@dodi/character/character-files";
import { addCustomAccessories, loadCustomAvatar } from "@dodi/character/custom-assets";
import type { CompanionLook } from "@dodi/character/character-look";
import type { CharacterPose } from "@dodi/character/character-pose";
import { CharacterStage, canvasScaleFor, type TrickOutcome } from "@dodi/character/character-stage";
import { buildMotionClip } from "@dodi/character/motion-clip";
import { fitMotionScript, type MotionScript } from "@dodi/character/motion-script";

import { useCharacterAssetStore } from "@/stores/character-asset-store";
import { dodiOutputLevel } from "@/stores/dodi-session-store";

import { attachCharacterGestures } from "./character-gestures";

/**
 * The 3D companion (@dodi/character) on one canvas for the whole session.
 * Views mount it into their own box; when a view swaps its figure (a new state
 * renders a new branch), the canvas moves over and the animation carries on,
 * cross-fading into the next clip instead of reloading. This file is the
 * browser's part: the canvas, its sizing, the frame loop, pointer input and
 * loading the files by URL. Format: characters/README.md.
 */

// The catalog's files, served from public/characters (kit.publish_to_web).
const assetUrl = (file: string): string => `/characters/${file}`;
// A family's own avatars and accessories: fetched and opened by the store, loaded from bytes.
const customAssetBytes = (assetId: string): Promise<Uint8Array> =>
  useCharacterAssetStore.getState().getBytes(assetId);

// Rendered at SUPERSAMPLE x the device resolution and scaled down by the
// browser, which smooths the outline's pixel steps; device ratio capped at 2.
const MAX_DEVICE_PIXEL_RATIO = 2;
const SUPERSAMPLE = 2;
// The canvas reaches past the view's box (canvasScaleFor); the buffer's longer
// side is capped, and past it the supersampling gives way.
const MAX_BUFFER_SIDE = 2048;

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

class CanvasStage {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly clock = new THREE.Clock();
  private readonly resizeObserver: ResizeObserver;

  private host: HTMLElement | null = null;
  private look: CompanionLook | null = null;
  private frame = 0;
  private canvasScale = 0;
  // DEBUG(sleep-eyes): temporary.
  private debugFrames = 0;
  private debugLastFrameAt = 0;

  constructor(private readonly stage: CharacterStage) {
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.domElement.style.position = "absolute";
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.pointerEvents = "none";
    // DEBUG(sleep-eyes): temporary.
    debugStageCount += 1;
    console.info("[character] stage created", { stageNumber: debugStageCount, clips: [...stage.clipNames] });
    (window as unknown as { characterDebug?: () => unknown }).characterDebug = () => this.debugSnapshot();
    this.renderer.domElement.addEventListener("webglcontextlost", () =>
      console.warn("[character] WebGL context lost", { stageNumber: debugStageCount, frames: this.debugFrames }),
    );
    this.renderer.domElement.addEventListener("webglcontextrestored", () =>
      console.warn("[character] WebGL context restored", { stageNumber: debugStageCount }),
    );

    this.resizeObserver = new ResizeObserver(() => this.resize());
  }

  mount(host: HTMLElement): () => void {
    console.info("[character] mount", { hadHost: this.host !== null, frame: this.frame }); // DEBUG(sleep-eyes)
    this.host = host;
    host.appendChild(this.renderer.domElement);
    this.resizeObserver.observe(host);
    // Gestures cover the view's whole area (the page around dodi), if it marks one.
    const area = host.closest<HTMLElement>("[data-character-area]") ?? host;
    const tapButton = host.closest("button");
    const view = this.stage.view;
    const detachGestures = attachCharacterGestures(area, {
      hitsCharacter: (x, y) => this.hitsCharacter(x, y),
      isOnOtherControl: (target) => {
        const control = target instanceof Element ? target.closest(OTHER_CONTROLS) : null;
        return control !== null && control !== tapButton;
      },
      reachesTapButton: (target) => target instanceof Node && tapButton?.contains(target) === true,
      tap: () => tapButton?.click(),
      orbitBy: (dx, dy) => view.orbitBy(dx, dy),
      zoomBy: (factor) => view.zoomBy(factor),
    });
    this.resize();
    this.renderFrame();
    cancelAnimationFrame(this.frame); // a view that took over before the last one let go
    this.frame = requestAnimationFrame(this.tick);
    return () => {
      detachGestures();
      console.info("[character] unmount", { isCurrentHost: this.host === host }); // DEBUG(sleep-eyes)
      if (this.host !== host) return; // another view has taken over already
      this.resizeObserver.unobserve(host);
      cancelAnimationFrame(this.frame);
      this.frame = 0; // DEBUG(sleep-eyes): so the snapshot's isTicking is truthful
      this.renderer.domElement.remove();
      this.host = null;
    };
  }

  applyLook(look: CompanionLook): void {
    this.look = look;
    this.stage.applyLook(look);
    if (!look.accessories.some(isCustomAssetRef)) return;
    // The family's own accessories load on first wear, then show (if still worn).
    void addCustomAccessories(this.stage, look.accessories, customAssetBytes).then(() => {
      if (this.look === look) this.stage.applyLook(look);
    });
  }

  /** The loaded rig's bones (a custom avatar's tricks are fitted to them). */
  get rigBones(): string[] {
    return this.stage.boneNames;
  }

  playTrick(script: MotionScript): Promise<TrickOutcome> {
    const clip = buildMotionClip(script, this.stage.motionRig);
    return this.stage.playOnce(clip, prefersReducedMotion());
  }

  setPose(pose: CharacterPose): void {
    const previous = this.stage.currentPose;
    const isReducedMotion = prefersReducedMotion();
    // DEBUG(sleep-eyes): temporary, remove once the sleep-with-open-eyes bug is found.
    console.info("[character] setPose", {
      requested: pose.clip,
      previous: previous?.clip ?? null,
      current: this.stage.currentClip,
      hasRequestedClip: this.stage.clipNames.includes(pose.clip),
      isReducedMotion,
      isMounted: this.host !== null,
    });
    const change = this.stage.setPose(pose, isReducedMotion);
    if (change.unchangedBecause === "no-clip" || change.unchangedBecause === "same-action") {
      console.info("[character] setPose skipped", {
        hasNext: change.unchangedBecause === "same-action",
        isSameAction: change.unchangedBecause === "same-action",
      });
    }
  }

  /** DEBUG(sleep-eyes): temporary. Call `characterDebug()` in the console. */
  private debugSnapshot(): unknown {
    const canvas = this.renderer.domElement;
    return {
      ...this.stage.debugSnapshot(),
      isMounted: this.host !== null,
      isTicking: this.frame !== 0,
      framesRendered: this.debugFrames,
      msSinceLastFrame: Math.round(performance.now() - this.debugLastFrameAt),
      isContextLost: this.renderer.getContext().isContextLost(),
      isCanvasConnected: canvas.isConnected,
      canvasSize: `${canvas.width}x${canvas.height}`,
      canvasesInPage: document.querySelectorAll("canvas").length,
      visibility: document.visibilityState,
    };
  }

  private readonly tick = (): void => {
    this.frame = requestAnimationFrame(this.tick);
    // DEBUG(sleep-eyes): temporary. A gap means the loop was paused (hidden tab) or stalled.
    const now = performance.now();
    if (this.debugLastFrameAt !== 0 && now - this.debugLastFrameAt > 1000) {
      console.info("[character] frame loop resumed", {
        gapMs: Math.round(now - this.debugLastFrameAt),
        pose: this.stage.currentPose?.clip ?? null,
        current: this.stage.currentClip,
      });
    }
    this.debugLastFrameAt = now;
    this.debugFrames += 1;
    this.renderFrame();
  };

  private renderFrame(): void {
    this.stage.update(this.clock.getDelta());
    if (this.host && canvasScaleFor(this.stage.view.zoom) !== this.canvasScale) {
      this.resize(); // draws the frame
      return;
    }
    this.stage.render(this.renderer);
  }

  private hitsCharacter(clientX: number, clientY: number): boolean {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    return this.stage.hitTest(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
  }

  private resize(): void {
    if (!this.host) return;
    const boxWidth = Math.max(1, this.host.clientWidth);
    const boxHeight = Math.max(1, this.host.clientHeight);
    this.canvasScale = canvasScaleFor(this.stage.view.zoom);
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
    const buffer = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.stage.layout({
      boxWidth,
      boxHeight,
      canvasWidth: width,
      canvasHeight: height,
      bufferWidth: buffer.x,
      bufferHeight: buffer.y,
      pixelRatio,
    });
    this.renderFrame();
  }
}

// Controls of the page whose presses are theirs, not a gesture.
const OTHER_CONTROLS = "button, a, input, textarea, select, label, [role='button']";

// One stage per avatar model, loaded when first shown.
const stages = new Map<CharacterModelRef, CanvasStage>();
let debugStageCount = 0; // DEBUG(sleep-eyes): temporary.
const loading = new Map<CharacterModelRef, Promise<void>>();
let lastPose: CharacterPose | null = null;
let lastLook: CompanionLook | null = null;

/**
 * Load a model and the accessories once; rejects if WebGL or the model fails.
 * An accessory that fails to load is left out rather than failing the stage.
 */
export function loadCharacterStage(model: CharacterModelRef = DEFAULT_CHARACTER_MODEL): Promise<void> {
  const existing = loading.get(model);
  if (existing) return existing;
  const promise = (async () => {
    const loader = new GLTFLoader();
    // A catalog avatar by URL; a family's own from its decrypted bytes.
    const characterFile: Promise<CharacterFile> = isCustomAssetRef(model)
      ? loadCustomAvatar(model, customAssetBytes)
      : loader.loadAsync(assetUrl(characterModelFor(model).file));
    const [character, ...accessories] = await Promise.all([
      characterFile,
      ...ACCESSORY_LIST.map((name) =>
        loader.loadAsync(assetUrl(ACCESSORIES[name].file)).catch((err: unknown) => {
          console.warn(`[character] accessory ${name} unavailable:`, err);
          return null;
        }),
      ),
    ]);
    // Each glTF scene group carries its file's manifest (scene extras) in userData.
    const accessoryFiles = new Map<string, CharacterFile>();
    accessories.forEach((gltf, i) => {
      if (gltf) accessoryFiles.set(ACCESSORY_LIST[i], { scene: gltf.scene, animations: gltf.animations });
    });
    const scene = new CharacterStage(
      { scene: character.scene, animations: character.animations },
      accessoryFiles,
      { voiceLevel: dodiOutputLevel },
    );
    const canvasStage = new CanvasStage(scene);
    if (lastPose) canvasStage.setPose(lastPose);
    if (lastLook?.model === model) canvasStage.applyLook(lastLook);
    stages.set(model, canvasStage);
  })();
  loading.set(model, promise);
  promise.catch(() => {
    loading.delete(model); // a later mount may retry
  });
  return promise;
}

export function isCharacterStageReady(model: CharacterModelRef = DEFAULT_CHARACTER_MODEL): boolean {
  return stages.has(model);
}

/** Show the character in `host` (replacing wherever it was); returns the unmount. */
export function mountCharacterStage(host: HTMLElement, model: CharacterModelRef = DEFAULT_CHARACTER_MODEL): () => void {
  const stage = stages.get(model);
  if (!stage) throw new Error(`character stage ${model} not loaded`);
  return stage.mount(host);
}

export function setCharacterPose(pose: CharacterPose): void {
  lastPose = pose;
  for (const stage of stages.values()) stage.setPose(pose);
}

/** The companion's look (its model's stage wears it). */
export function setCharacterLook(look: CompanionLook): void {
  lastLook = look;
  stages.get(look.model)?.applyLook(look);
}

/** Play a trick on a model's stage; resolves when it ends. */
export function playCharacterTrick(
  model: CharacterModelRef,
  script: MotionScript,
): Promise<TrickOutcome | "unavailable"> {
  const stage = stages.get(model);
  if (!stage) return Promise.resolve("unavailable");
  // Fitted to this model: bones it lacks drop out, values stay in its limits.
  // A custom avatar is fitted to the bones its file really has.
  const described = characterModelFor(model);
  const target = isCustomAssetRef(model) ? withRigBones(described, stage.rigBones) : described;
  return stage.playTrick(fitMotionScript(script, target).script);
}
