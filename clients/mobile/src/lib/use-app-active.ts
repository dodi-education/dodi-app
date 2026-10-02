import { useEffect, useState } from "react";
import { AppState } from "react-native";

/** Whether the app is in the foreground (the web's visible document). */
export function useIsAppActive(): boolean {
  const [isActive, setIsActive] = useState(AppState.currentState === "active");
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => setIsActive(next === "active"));
    return () => sub.remove();
  }, []);
  return isActive;
}
