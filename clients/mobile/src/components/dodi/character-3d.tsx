import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { GLView, type ExpoWebGLRenderingContext } from "expo-gl";
import { useIsFocused } from "expo-router";
import { DEFAULT_CHARACTER_MODEL, type CharacterModelRef } from "@dodi/character/character-catalog";
import { defaultLook, type CompanionLook } from "@dodi/character/character-look";
import { canvasScaleFor, type CharacterStage } from "@dodi/character/character-stage";
import { characterPoseFor, IDLE_POSE, type CompanionState } from "@dodi/character/character-pose";
import type { FigureModeInput } from "@dodi/character/figure-mode";
import { companionCharacter } from "@dodi/ui-recipes";

import {
  createCharacterRenderer,
  loadCharacterStage,
  loadedCharacterStage,
  playCharacterTrick,
  routeVoiceLevel,
  setCharacterLook,
  type CharacterRenderer,
} from "@/adapters/character-gl";
import { useCompanionStageStore } from "@/lib/client-state";

import { ThinkBubbles } from "./think-bubbles";
import { useIsAppActive } from "@/lib/use-app-active";
import { useWornLook } from "@/lib/use-worn-look";
import { useReduceMotion } from "@/lib/use-reduce-motion";

import { useCharacterGestures, type CharacterGestureTarget } from "./use-character-gestures";

export interface Character3dProps {
  /** The loaded stage (useCharacterStage); null keeps the figure's box empty while the figure is decided. */
  stage: CharacterStage | null;
  /** The stage's avatar model (tricks are fitted to it). */
  model: CharacterModelRef;
  /** The companion's look to wear (a look being tried on, else the saved one). */
  look: CompanionLook;
  /** GL setup failed: the view falls back to the 2D figure. */
  onFailed: () => void;
  /** The voice session's state; unset, the character stands by (idle). */
  state?: CompanionState;
  /** Mid-activity (thinking, creating a picture, writing). */
  isThinking?: boolean;
  /** Voice audio is playing (the talk clip, jaw on the voice level). */
  isSpeaking?: boolean;
  /** The voice's loudness right now, 0..1 (read every frame while talking). */
  voiceLevel?: () => number;
  /** A tap on the character (the web's: talk / wake). */
  onPress?: () => void;
  alt: string;
  /** What the companion is doing (read after `alt`): listening, asleep … */
  stateLabel?: string;
}

interface Box {
  width: number;
  height: number;
}

// The surface reaches past the box as the web's unzoomed canvas does, so a
// turned character is not cut off (expo-gl fixes its size, so there is no zoom).
const CANVAS_SCALE = canvasScaleFor(1);
// Frames at most this often: the outline pass reads ~70 texels per pixel, and
// a toon character reads smoothly at 30 fps; this halves the GPU's (and the
// battery's) work against the display's 60 or 120 Hz.
const FRAME_INTERVAL_MS = 1000 / 30;

export interface CharacterStageLoad {
  stage: CharacterStage | null;
  /** The model `stage` shows (the one before stays while a new avatar loads). */
  model: CharacterModelRef;
  load: FigureModeInput["load"];
  /** Mark the character unavailable (GL setup failed). */
  fail: () => void;
}

/**
 * The app's character stage of `model` for a view: at once if an earlier view
 * loaded it, else loaded while `isWanted` (the account's 3D setting is on or
 * not known yet). While a new avatar loads, the one before stays on screen.
 */
export function useCharacterStage(isWanted: boolean, requested: CharacterModelRef): CharacterStageLoad {
  // A family's own avatar waits for the asset list (a deleted one falls back to
  // the default), and one whose file fails gives way to the default, not to 2D.
  const requestedLook = useMemo(() => defaultLook(requested), [requested]);
  const worn = useWornLook(requestedLook);
  const [brokenModels, setBrokenModels] = useState<ReadonlySet<string>>(() => new Set());
  const isPending = worn === null;
  const model: CharacterModelRef =
    worn === null || brokenModels.has(worn.model) ? DEFAULT_CHARACTER_MODEL : worn.model;
  const [loaded, setLoaded] = useState<{ stage: CharacterStage; model: CharacterModelRef } | null>(() => {
    const ready = loadedCharacterStage(model);
    return ready ? { stage: ready, model } : null;
  });
  const [hasFailed, setHasFailed] = useState(false);

  useEffect(() => {
    if (!isWanted || hasFailed || isPending || loaded?.model === model) return;
    let isCurrent = true;
    loadCharacterStage(model).then(
      (stage) => isCurrent && setLoaded({ stage, model }),
      (err: unknown) => {
        if (!isCurrent) return;
        if (model !== DEFAULT_CHARACTER_MODEL) {
          console.warn("[character] custom avatar unavailable, showing the default:", err);
          setBrokenModels((broken) => new Set(broken).add(model));
          return;
        }
        console.warn("[character] 3D character unavailable, showing the 2D figure:", err);
        setHasFailed(true);
      },
    );
    return () => {
      isCurrent = false;
    };
  }, [loaded, model, isWanted, hasFailed, isPending]);

  const fail = useCallback(() => setHasFailed(true), []);
  return {
    stage: loaded?.stage ?? null,
    model: loaded?.model ?? model,
    load: hasFailed ? "failed" : loaded ? "ready" : "loading",
    fail,
  };
}

// Each trick request plays once, on whichever view shows the character.
let playedTrickNonce = 0;

// The views showing the character, latest last: only the latest draws and
// advances the clips (one stage, shared, as the web's one canvas).
const owners: object[] = [];

/**
 * dodi as the 3D character (web: components/dodi/dodi-character-3d), drawn
 * with expo-gl by @dodi/character. Renders only while its screen is focused
 * and the app in the foreground; reduced motion holds each pose still.
 * Without a stage it is the figure's empty box (still named), shown while
 * the view decides between 2D and 3D (@dodi/character/figure-mode).
 */
export function Character3d({
  stage,
  model,
  look,
  onFailed,
  state,
  isThinking = false,
  isSpeaking = false,
  voiceLevel,
  onPress,
  alt,
  stateLabel,
}: Character3dProps) {
  const isLearning = useCompanionStageStore((s) => s.isLearningTrick);
  const pose = useMemo(
    () =>
      state || isLearning
        ? characterPoseFor({ state: state ?? "active", isThinking, isSpeaking, isLearning })
        : IDLE_POSE,
    [state, isThinking, isSpeaking, isLearning],
  );
  const [box, setBox] = useState<Box | null>(null);
  const isReducedMotion = useReduceMotion();
  const isFocused = useIsFocused();
  const isAppActive = useIsAppActive();
  const isRunning = isFocused && isAppActive;
  const [token] = useState(() => ({}));
  // The GL context of the current GLView. Its resources go with the view (expo-gl
  // destroys the context on unmount), so renderers are dropped, not disposed.
  const gl = useRef<{ context: ExpoWebGLRenderingContext; renderer: CharacterRenderer } | null>(null);

  useEffect(() => {
    owners.push(token);
    return () => {
      owners.splice(owners.indexOf(token), 1);
    };
  }, [token]);

  // Pose first: a pose change under reduced motion holds the new clip's first frame.
  useEffect(() => {
    stage?.setPose(pose, isReducedMotion);
  }, [stage, pose, isReducedMotion]);
  useEffect(() => {
    stage?.setReducedMotion(isReducedMotion);
  }, [stage, isReducedMotion]);
  useEffect(() => (voiceLevel ? routeVoiceLevel(voiceLevel) : undefined), [voiceLevel]);
  // The look as this stage can wear it: the family's own assets only while
  // they exist, and the stage's model (a custom avatar may have fallen back).
  const wornLook = useWornLook(look);
  useEffect(() => {
    if (!stage || !wornLook) return;
    setCharacterLook(wornLook.model === model ? wornLook : { ...wornLook, model, colors: {} });
  }, [stage, wornLook, model]);

  // Tricks: the Playground and the voice ask through the stage store.
  const trickRequest = useCompanionStageStore((s) => s.trickRequest);
  const setCharacterShown = useCompanionStageStore((s) => s.setCharacterShown);
  const settleTrick = useCompanionStageStore((s) => s.settleTrick);
  useEffect(() => {
    setCharacterShown(stage !== null);
    return () => setCharacterShown(false);
  }, [stage, setCharacterShown]);
  useEffect(() => {
    if (!trickRequest || trickRequest.nonce <= playedTrickNonce) return;
    playedTrickNonce = trickRequest.nonce;
    const { nonce, trick } = trickRequest;
    if (!stage) {
      settleTrick(nonce, "unavailable");
      return;
    }
    void playCharacterTrick(stage, model, trick.script, isReducedMotion).then((outcome) => settleTrick(nonce, outcome));
  }, [trickRequest, stage, model, isReducedMotion, settleTrick]);

  // The frame loop: only while shown, and only for the view that owns the character.
  useEffect(() => {
    if (!stage || !isRunning) return;
    let frame = 0;
    let last = performance.now();
    const tick = (): void => {
      frame = requestAnimationFrame(tick);
      const current = gl.current;
      const now = performance.now();
      if (now - last < FRAME_INTERVAL_MS - 2) return; // a little early is the next vsync's frame
      const delta = (now - last) / 1000;
      last = now;
      if (!current || owners[owners.length - 1] !== token) return;
      stage.update(delta);
      stage.render(current.renderer);
      current.context.endFrameEXP();
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [stage, isRunning, token]);

  const canvas = box ? { width: box.width * CANVAS_SCALE, height: box.height * CANVAS_SCALE } : null;
  // What touches act on, as of the last render (read when a touch comes).
  const target = useRef<CharacterGestureTarget | null>(null);
  useEffect(() => {
    target.current =
      stage && box && canvas
        ? {
            hitsCharacter: (x, y) =>
              stage.hitTest(
                ((x + (canvas.width - box.width) / 2) / canvas.width) * 2 - 1,
                -(((y + (canvas.height - box.height) / 2) / canvas.height) * 2 - 1),
              ),
            orbitBy: (dx, dy) => stage.view.orbitBy(dx, dy),
            onTap: onPress,
          }
        : null;
  });
  const handlers = useCharacterGestures(() => target.current);

  function onContextCreate(context: ExpoWebGLRenderingContext): void {
    if (!stage || !box || !canvas) return;
    try {
      const renderer = createCharacterRenderer(context);
      stage.layout({
        boxWidth: box.width,
        boxHeight: box.height,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        bufferWidth: context.drawingBufferWidth,
        bufferHeight: context.drawingBufferHeight,
        pixelRatio: context.drawingBufferWidth / canvas.width,
      });
      const outline = stage.chooseOutline(renderer);
      if (outline !== "edges") console.info("[character] the edge outline is unavailable here, drawing the hull");
      gl.current = { context, renderer };
    } catch (err) {
      console.warn("[character] GL setup failed, showing the 2D figure:", err);
      onFailed();
    }
  }

  const onLayout = (event: LayoutChangeEvent): void => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 0 && height > 0 && (width !== box?.width || height !== box?.height)) setBox({ width, height });
  };

  return (
    <View
      className={companionCharacter.host}
      onLayout={onLayout}
      accessible
      accessibilityRole={onPress ? "button" : "image"}
      accessibilityLabel={alt}
      accessibilityValue={stateLabel ? { text: stateLabel } : undefined}
      accessibilityActions={onPress ? [{ name: "activate" }] : undefined}
      onAccessibilityAction={onPress ? () => onPress() : undefined}
      {...(stage ? handlers : {})}
    >
      {stage && box && canvas ? (
        <View
          className={companionCharacter.surface}
          style={{
            width: canvas.width,
            height: canvas.height,
            left: (box.width - canvas.width) / 2,
            top: (box.height - canvas.height) / 2,
          }}
          pointerEvents="none"
        >
          <GLView
            // expo-gl fixes the buffer to the view's size when the context is made.
            key={`${Math.round(canvas.width)}x${Math.round(canvas.height)}`}
            style={StyleSheet.absoluteFill}
            onContextCreate={onContextCreate}
          />
        </View>
      ) : null}
      {stage && pose.clip === "think" ? <ThinkBubbles /> : null}
    </View>
  );
}
