import type { DodiState } from "@/stores/dodi-session-store";

export function getDodiImage(state: DodiState, head: boolean): string {
  switch (state) {
    case "active":
      return head ? "/images/dodi-head-active.png" : "/images/dodi-active.png";
    case "deaf":
      return head ? "/images/dodi-head-deaf.png" : "/images/dodi-deaf.png";
    case "sleep":
    case "disconnected":
    case "connecting":
    default:
      return head ? "/images/dodi-head-sleep.png" : "/images/dodi-sleep.png";
  }
}
