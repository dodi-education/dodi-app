import { useEffect, useId, useState } from "react";
import { Animated, Easing, StyleSheet } from "react-native";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";
import { listeningPulse as p } from "@dodi/ui-recipes";

import { cn } from "@/lib/cn";
import { useReduceMotion } from "@/lib/use-reduce-motion";

interface ListeningPulseProps {
  /** Inset of the pulse circles relative to the mascot wrapper. */
  className?: string;
}

/** One pulse: grows 0.8 → 1.25 and fades in and out (web: kpulse), after `delay`. */
function Pulse({ delay, className, isReduced }: { delay: number; className?: string; isReduced: boolean }) {
  // SVG ids can't carry React's ":r0:" punctuation.
  const gradientId = `pulse${useId().replace(/[^A-Za-z0-9_-]/g, "")}`;
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (isReduced) return;
    progress.setValue(0);
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: p.durationMs,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    );
    const timer = setTimeout(() => loop.start(), delay);
    return () => {
      clearTimeout(timer);
      loop.stop();
    };
  }, [progress, delay, isReduced]);

  const style = isReduced
    ? { opacity: p.reducedOpacity }
    : {
        opacity: progress.interpolate({ inputRange: [0, p.peakAt, 1], outputRange: [0, 1, 0] }),
        transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [p.scaleFrom, p.scaleTo] }) }],
      };

  return (
    <Animated.View
      className={cn(p.circle, className)}
      style={style}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg style={StyleSheet.absoluteFill} viewBox="0 0 100 100">
        <Defs>
          <RadialGradient id={gradientId} cx="50" cy="50" r="50" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={`rgb(${p.rgb})`} stopOpacity={p.centerOpacity} />
            <Stop offset={p.fadeStopPercent / 100} stopColor={`rgb(${p.rgb})`} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx="50" cy="50" r="50" fill={`url(#${gradientId})`} />
      </Svg>
    </Animated.View>
  );
}

/**
 * Two soft radial pulses behind dodi while it listens (web:
 * components/kid/listening-pulse). Render inside a `relative` box around the
 * mascot. Reduced motion holds them still at half opacity.
 */
export function ListeningPulse({ className }: ListeningPulseProps) {
  const isReduced = useReduceMotion();
  return (
    <>
      <Pulse delay={0} className={className} isReduced={isReduced} />
      <Pulse delay={p.staggerMs} className={className} isReduced={isReduced} />
    </>
  );
}
