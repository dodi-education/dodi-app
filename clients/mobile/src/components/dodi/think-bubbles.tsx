import { useEffect, useState } from "react";
import { Animated, Easing, View } from "react-native";
import { thinkBubbles as b } from "@dodi/ui-recipes";

import { Icon } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useReduceMotion } from "@/lib/use-reduce-motion";

/** A part that pops in after `step` others (web: animate-in zoom-in); still under reduced motion. */
function usePop(step: number, isReduced: boolean): Animated.Value {
  const [value] = useState(() => new Animated.Value(isReduced ? 1 : 0));
  useEffect(() => {
    if (isReduced) {
      value.setValue(1);
      return;
    }
    const pop = Animated.timing(value, {
      toValue: 1,
      duration: 300,
      delay: step * b.staggerMs,
      easing: Easing.out(Easing.back(1.6)),
      useNativeDriver: true,
    });
    pop.start();
    return () => pop.stop();
  }, [value, step, isReduced]);
  return value;
}

function popStyle(value: Animated.Value) {
  return {
    opacity: value,
    transform: [{ scale: value.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }],
  };
}

/**
 * Thought bubbles above the 3D character while it thinks (web:
 * components/dodi/think-bubbles): two puffs rising to a bubble with a turning
 * gear. Decorative: the figure's own label says what it is doing.
 */
export function ThinkBubbles() {
  const isReduced = useReduceMotion();
  const small = usePop(0, isReduced);
  const medium = usePop(1, isReduced);
  const bubble = usePop(2, isReduced);
  const [spin] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (isReduced) return;
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: b.spinMs, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin, isReduced]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className={b.root}
    >
      <Animated.View className={b.puffSmall} style={popStyle(small)} />
      <Animated.View className={b.puffMedium} style={popStyle(medium)} />
      <Animated.View className={cn(b.bubble)} style={popStyle(bubble)}>
        <Animated.View style={isReduced ? undefined : { transform: [{ rotate }] }}>
          <Icon name="settings" size={b.gearSize} color="dodi-700" />
        </Animated.View>
      </Animated.View>
    </View>
  );
}
