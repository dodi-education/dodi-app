import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/** Whether the OS asks for reduced motion (the web's prefers-reduced-motion). */
export function useReduceMotion(): boolean {
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
