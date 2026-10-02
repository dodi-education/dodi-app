import { useEffect, useState } from "react";
import { Animated, Easing, View } from "react-native";
import { speakingDots as d } from "@dodi/ui-recipes";

import { cn } from "@/lib/cn";
import { useReduceMotion } from "@/lib/use-reduce-motion";

/** One dot of the web's animate-kdot: rises 4px and brightens at the midpoint. */
function Dot({ delay, className, isReduced }: { delay: number; className?: string; isReduced: boolean }) {
  const [value] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (isReduced) return;
    const half = d.durationMs / 2;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(value, { toValue: 1, duration: half, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(value, { toValue: 0, duration: half, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    const timer = setTimeout(() => loop.start(), delay);
    return () => {
      clearTimeout(timer);
      loop.stop();
    };
  }, [value, delay, isReduced]);

  const style = isReduced
    ? undefined
    : {
        opacity: value.interpolate({ inputRange: [0, 1], outputRange: [d.restOpacity, 1] }),
        transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [0, -d.rise] }) }],
      };
  return <Animated.View className={cn(d.dot, className)} style={style} />;
}

/**
 * dodi talking (or at work): three dots rising in turn (web: the animate-kdot
 * spans in dodi-full-home / dodi-full-game). Decorative; the text beside them
 * says what is happening. Reduced motion holds them still.
 */
export function SpeakingDots({ dotClassName }: { dotClassName?: string }) {
  const isReduced = useReduceMotion();
  return (
    <View className={d.row} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {[0, 1, 2].map((i) => (
        <Dot key={i} delay={i * d.staggerMs} className={dotClassName} isReduced={isReduced} />
      ))}
    </View>
  );
}
