import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import { ACCESSORY_NAMES, type AccessoryName, type CharacterFile } from "@dodi/character/character-files";
import type { CharacterPose } from "@dodi/character/character-pose";
import { CharacterStage, canvasScaleFor } from "@dodi/character/character-stage";

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

const CHARACTER_URL = "/characters/dodi.glb";
const ACCESSORY_URLS: Record<AccessoryName, string> = {
  headphones: "/characters/accessories/headphones.glb",
};

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
  private frame = 0;
  private canvasScale = 0;

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

    this.resizeObserver = new ResizeObserver(() => this.resize());
  }

  mount(host: HTMLElement): () => void {
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
      if (this.host !== host) return; // another view has taken over already
      this.resizeObserver.unobserve(host);
      cancelAnimationFrame(this.frame);
      this.renderer.domElement.remove();
      this.host = null;
    };
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
    return { ...this.stage.debugSnapshot(), isMounted: this.host !== null, isTicking: this.frame !== 0 };
  }

  private readonly tick = (): void => {
    this.frame = requestAnimationFrame(this.tick);
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

let stage: CanvasStage | null = null;
let debugStageCount = 0; // DEBUG(sleep-eyes): temporary.
let loading: Promise<void> | null = null;

/** Load the character and its accessories once; rejects if WebGL or the files fail. */
export function loadCharacterStage(): Promise<void> {
  loading ??= (async () => {
    const loader = new GLTFLoader();
    const [character, ...accessories] = await Promise.all([
      loader.loadAsync(CHARACTER_URL),
      ...ACCESSORY_NAMES.map((name) => loader.loadAsync(ACCESSORY_URLS[name])),
    ]);
    // Each glTF scene group carries its file's manifest (scene extras) in userData.
    const accessoryFiles = new Map<string, CharacterFile>(
      accessories.map((gltf, i) => [ACCESSORY_NAMES[i], { scene: gltf.scene, animations: gltf.animations }]),
    );
    const scene = new CharacterStage(
      { scene: character.scene, animations: character.animations },
      accessoryFiles,
      { voiceLevel: dodiOutputLevel },
    );
    stage = new CanvasStage(scene);
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
