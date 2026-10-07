import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, View } from "react-native";
import { type SnapshotFlashRect, snapshotFlash as f } from "@dodi/ui-recipes";

import { playShutterSound } from "@/adapters/shutter-sound";
import { runSnapshotFlashSequence } from "@/lib/snapshot-flash-sequence";

/**
 * iOS-screenshot-style feedback for a manually saved snapshot (web:
 * components/snapshots/snapshot-flash): the captured image appears over the
 * game stage, shrinks into a 100×100 card above the Snapshots nav item, holds
 * a beat and fades away. Reduced motion skips the flight: the card appears at
 * its landing spot, holds and fades. All rects are window rects; `origin` is
 * the overlay's window position, so they convert to its coordinates.
 * `isReducedMotion` and the rects are read once, at mount: the flash never
 * restarts. Plays the shutter sound once on mount, like the web.
 */
export function SnapshotFlash({
  image,
  startRect,
  target,
  origin,
  isReducedMotion,
  onDone,
}: {
  /** The captured game image (data URL). */
  image: string;
  /** Window rect of the game stage at capture time: the animation start. */
  startRect: SnapshotFlashRect;
  /** Window rect of the landing card (snapshotFlashTarget). */
  target: SnapshotFlashRect;
  /** Window position of the overlay. */
  origin: { x: number; y: number };
  /** Decided before mount; fixed for the flash's life. */
  isReducedMotion: boolean;
  /** Unmount callback once the flash has fully faded. */
  onDone: () => void;
}) {
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  // Frozen at mount: later prop changes never move or restart the flash.
  const [frames] = useState(() => {
    const to = { ...target, left: target.left - origin.x, top: target.top - origin.y };
    const from = isReducedMotion ? to : { ...startRect, left: startRect.left - origin.x, top: startRect.top - origin.y };
    return { from, to, origin, isReducedMotion };
  });
  const [flight] = useState(() => new Animated.Value(0));
  const [opacity] = useState(() => new Animated.Value(1));

  // Once per flash (the ref survives a StrictMode effect re-run).
  const isSoundPlayedRef = useRef(false);
  useEffect(() => {
    if (isSoundPlayedRef.current) return;
    isSoundPlayedRef.current = true;
    playShutterSound();
  }, []);

  useEffect(() => {
    // Layout props animate on the JS driver (Date.now + frame callbacks), which
    // Android's animator duration scale doesn't touch: with animations removed
    // in the system settings the flight and fade still take their full time.
    const startTiming = (
      value: Animated.Value,
      config: Omit<Animated.TimingAnimationConfig, "useNativeDriver">,
      onEnd: (isFinished: boolean) => void,
    ): void => {
      Animated.timing(value, { ...config, useNativeDriver: false }).start(({ finished }) => onEnd(finished));
    };
    const cancel = runSnapshotFlashSequence(
      {
        fly: (onEnd) =>
          startTiming(flight, { toValue: 1, duration: f.flyMs, easing: Easing.bezier(0.32, 0.72, 0.35, 1) }, onEnd),
        fade: (onEnd) => startTiming(opacity, { toValue: 0, duration: f.fadeMs, easing: Easing.out(Easing.ease) }, onEnd),
        // Stopping reports the running animation unfinished: never "done".
        stop: () => {
          flight.stopAnimation();
          opacity.stopAnimation();
        },
      },
      {
        isReducedMotion: frames.isReducedMotion,
        onDone: () => onDoneRef.current(),
      },
    );
    return cancel;
  }, [flight, opacity, frames]);

  const { from, to } = frames;
  const lerp = (a: number, b: number) => flight.interpolate({ inputRange: [0, 1], outputRange: [a, b] });

  return (
    <View
      pointerEvents="none"
      className={f.overlay}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View
        className={f.image}
        style={{
          left: lerp(from.left, to.left),
          top: lerp(from.top, to.top),
          width: lerp(from.width, to.width),
          height: lerp(from.height, to.height),
          opacity,
          shadowColor: f.shadow.color,
          shadowOpacity: f.shadow.opacity,
          shadowRadius: f.shadow.radius / 2,
          shadowOffset: { width: 0, height: f.shadow.offsetY },
          elevation: f.shadow.elevation,
        }}
      >
        {/* Inner radius = 16px card minus the 3px border (no clipping, so the shadow shows). */}
        <Image
          source={{ uri: image }}
          className="h-full w-full rounded-[13px]"
          resizeMode="cover"
          accessibilityIgnoresInvertColors
          // Decorative: the flash only shows the save happening.
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      </Animated.View>
    </View>
  );
}
