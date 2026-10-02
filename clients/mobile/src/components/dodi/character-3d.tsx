import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, AppState, Pressable, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { GLView, type ExpoWebGLRenderingContext } from "expo-gl";
import { useIsFocused } from "expo-router";
import { canvasScaleFor, type CharacterStage } from "@dodi/character/character-stage";
import { characterPoseFor, IDLE_POSE, type CompanionState } from "@dodi/character/character-pose";
import { companionCharacter } from "@dodi/ui-recipes";

import {
  createCharacterRenderer,
  loadCharacterStage,
  loadedCharacterStage,
  routeVoiceLevel,
  type CharacterRenderer,
} from "@/adapters/character-gl";

import { useCharacterGestures, type CharacterGestureTarget } from "./use-character-gestures";

export interface Character3dProps {
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
  /** The 2D figure, shown until the first frame is drawn (and if GL or the model fails). */
  fallback: ReactNode;
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

// The views showing the character, latest last: only the latest draws and
// advances the clips (one stage, shared, as the web's one canvas).
const owners: object[] = [];

function useReduceMotion(): boolean {
  const [isReduced, setIsReduced] = useState(false);
  useEffect(() => {
    let isCurrent = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (isCurrent) setIsReduced(value);
    });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setIsReduced);
    return () => {
      isCurrent = false;
      sub.remove();
    };
  }, []);
  return isReduced;
}

function useIsAppActive(): boolean {
  const [isActive, setIsActive] = useState(AppState.currentState === "active");
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => setIsActive(next === "active"));
    return () => sub.remove();
  }, []);
  return isActive;
}

/**
 * dodi as the 3D character (web: components/dodi/dodi-character-3d), drawn
 * with expo-gl by @dodi/character. Renders only while its screen is focused
 * and the app in the foreground; reduced motion holds each pose still.
 */
export function Character3d({ state, isThinking = false, isSpeaking = false, voiceLevel, onPress, alt, fallback }: Character3dProps) {
  const pose = useMemo(
    () => (state ? characterPoseFor({ state, isThinking, isSpeaking }) : IDLE_POSE),
    [state, isThinking, isSpeaking],
  );
  const [stage, setStage] = useState<CharacterStage | null>(loadedCharacterStage);
  const [hasFailed, setHasFailed] = useState(false);
  const [hasFrame, setHasFrame] = useState(false);
  const [box, setBox] = useState<Box | null>(null);
  const isReducedMotion = useReduceMotion();
  const isFocused = useIsFocused();
  const isAppActive = useIsAppActive();
  const isRunning = isFocused && isAppActive;
  const [token] = useState(() => ({}));
  // The GL context of the current GLView. Its resources go with the view (expo-gl
  // destroys the context on unmount), so renderers are dropped, not disposed.
  const gl = useRef<{ context: ExpoWebGLRenderingContext; renderer: CharacterRenderer } | null>(null);
  const hasFrameRef = useRef(false);

  useEffect(() => {
    if (stage) return;
    let isCurrent = true;
    loadCharacterStage().then(
      (loaded) => isCurrent && setStage(loaded),
      (err: unknown) => {
        console.warn("[character] 3D character unavailable, showing the 2D figure:", err);
        if (isCurrent) setHasFailed(true);
      },
    );
    return () => {
      isCurrent = false;
    };
  }, [stage]);

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
      if (!hasFrameRef.current) {
        hasFrameRef.current = true;
        setHasFrame(true);
      }
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
      setHasFailed(true);
    }
  }

  const onLayout = (event: LayoutChangeEvent): void => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 0 && height > 0 && (width !== box?.width || height !== box?.height)) setBox({ width, height });
  };

  const isShown3d = stage !== null && !hasFailed;
  return (
    <View
      className={companionCharacter.host}
      onLayout={onLayout}
      accessible
      accessibilityRole={onPress ? "button" : "image"}
      accessibilityLabel={alt}
      accessibilityActions={onPress ? [{ name: "activate" }] : undefined}
      onAccessibilityAction={onPress ? () => onPress() : undefined}
      {...(isShown3d ? handlers : {})}
    >
      {!hasFrame || !isShown3d ? (
        // The 2D figure takes the taps while the 3D one isn't drawing.
        onPress && !isShown3d ? (
          <Pressable className="h-full w-full" onPress={onPress} accessible={false}>
            {fallback}
          </Pressable>
        ) : (
          fallback
        )
      ) : null}
      {isShown3d && box && canvas ? (
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
    </View>
  );
}
