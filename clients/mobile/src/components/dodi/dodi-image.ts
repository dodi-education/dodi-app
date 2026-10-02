import type { ImageSourcePropType } from "react-native";

import type { DodiState } from "@/lib/dodi-session-store";

const FULL = {
  active: require("../../../assets/images/dodi-active.png"),
  deaf: require("../../../assets/images/dodi-deaf.png"),
  sleep: require("../../../assets/images/dodi-sleep.png"),
  thinking: require("../../../assets/images/dodi-thinking.png"),
} as const;
const HEAD = {
  active: require("../../../assets/images/dodi-head-active.png"),
  deaf: require("../../../assets/images/dodi-head-deaf.png"),
  sleep: require("../../../assets/images/dodi-head-sleep.png"),
  thinking: require("../../../assets/images/dodi-head-thinking.png"),
} as const;

/** dodi's 2D artwork for a session state (web: lib/dodi-image + DodiFigure's thinking art). */
export function getDodiImage(state: DodiState, head: boolean, isThinking = false): ImageSourcePropType {
  const set = head ? HEAD : FULL;
  if (isThinking) return set.thinking;
  switch (state) {
    case "active":
      return set.active;
    case "deaf":
      return set.deaf;
    default:
      return set.sleep;
  }
}
