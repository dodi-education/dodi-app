import { useEffect, useState } from "react";
import { AccessibilityInfo, Animated, Easing, View } from "react-native";
import { chatThinking } from "@dodi/ui-recipes";

/** Whether the OS asks for reduced motion (the web's motion-reduce). */
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

/** One looping animation value, started on mount (static under reduced motion). */
function useLoop(make: (value: Animated.Value) => Animated.CompositeAnimation): Animated.Value {
  const [value] = useState(() => new Animated.Value(0));
  const isReduced = useReduceMotion();
  useEffect(() => {
    if (isReduced) return;
    const loop = Animated.loop(make(value));
    loop.start();
    return () => loop.stop();
    // `make` is a fresh closure every render; the loop is set up once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, isReduced]);
  return value;
}

/** The web's animate-pulse: fades between full and half opacity. */
export function PulseDot({ className }: { className: string }) {
  const value = useLoop((v) =>
    Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]),
  );
  return (
    <Animated.View
      className={className}
      style={{ opacity: value.interpolate({ inputRange: [0, 1], outputRange: [1, 0.5] }) }}
    />
  );
}

function BounceDot({ delay }: { delay: number }) {
  const value = useLoop((v) =>
    Animated.sequence([
      Animated.delay(delay),
      Animated.timing(v, { toValue: 1, duration: 500, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: 500, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      Animated.delay(300 - delay),
    ]),
  );
  return (
    <Animated.View
      className={chatThinking.dot}
      style={{ transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }) }] }}
    />
  );
}

/** dodi at work: three bouncing dots (the web's animate-bounce, staggered). */
export function ThinkingDots() {
  return (
    <View className={chatThinking.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <BounceDot delay={0} />
      <BounceDot delay={150} />
      <BounceDot delay={300} />
    </View>
  );
}
