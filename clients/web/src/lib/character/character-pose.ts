import type { DodiState } from "@/stores/dodi-session-store";

/** What the companion is doing, as the 3D character needs to know it. */
export interface CompanionPose {
  state: DodiState;
  /** Mid-activity (thinking, creating a picture, writing). */
  isThinking: boolean;
  /** Voice audio is playing. */
  isSpeaking: boolean;
}

/** A clip of the character format (characters/README.md) plus what rides on it. */
export interface CharacterPose {
  clip: "idle" | "listen" | "think" | "talk" | "sleep" | "deaf";
  /** Accessories worn in this pose, by accessory name. */
  accessories: readonly string[];
  /** The jaw follows the voice loudness. */
  hasVoiceJaw: boolean;
}

const NONE: readonly string[] = [];
const HEADPHONES: readonly string[] = ["headphones"];

/** The state table in characters/README.md ("How app states map onto a character"). */
export function characterPoseFor({ state, isThinking, isSpeaking }: CompanionPose): CharacterPose {
  if (state === "deaf") return { clip: "deaf", accessories: HEADPHONES, hasVoiceJaw: false };
  if (state === "sleep" || state === "disconnected") {
    return { clip: "sleep", accessories: NONE, hasVoiceJaw: false };
  }
  if (isThinking) return { clip: "think", accessories: NONE, hasVoiceJaw: false };
  if (state === "connecting") return { clip: "idle", accessories: NONE, hasVoiceJaw: false };
  if (isSpeaking) return { clip: "talk", accessories: NONE, hasVoiceJaw: true };
  return { clip: "listen", accessories: NONE, hasVoiceJaw: false };
}
