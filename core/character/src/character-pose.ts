/** The companion's session state, as both clients' voice sessions report it. */
export type CompanionState = "disconnected" | "connecting" | "active" | "deaf" | "sleep";

/** What the companion is doing, as the 3D character needs to know it. */
export interface CompanionPose {
  state: CompanionState;
  /** Mid-activity (thinking, creating a picture, writing). */
  isThinking: boolean;
  /** Voice audio is playing. */
  isSpeaking: boolean;
  /**
   * Learning a trick: thinks whatever the voice is doing (the Playground is
   * often used with the voice asleep or deaf), so the kid sees it working.
   */
  isLearning?: boolean;
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

/** Standing by, with no session state to show (a view with no voice session yet). */
export const IDLE_POSE: CharacterPose = { clip: "idle", accessories: NONE, hasVoiceJaw: false };

/** The state table in characters/README.md ("How app states map onto a character"). */
export function characterPoseFor({ state, isThinking, isSpeaking, isLearning }: CompanionPose): CharacterPose {
  if (isLearning) return { clip: "think", accessories: NONE, hasVoiceJaw: false };
  if (state === "deaf") return { clip: "deaf", accessories: HEADPHONES, hasVoiceJaw: false };
  if (state === "sleep" || state === "disconnected") {
    return { clip: "sleep", accessories: NONE, hasVoiceJaw: false };
  }
  if (isThinking) return { clip: "think", accessories: NONE, hasVoiceJaw: false };
  if (state === "connecting") return { clip: "idle", accessories: NONE, hasVoiceJaw: false };
  if (isSpeaking) return { clip: "talk", accessories: NONE, hasVoiceJaw: true };
  return { clip: "listen", accessories: NONE, hasVoiceJaw: false };
}
