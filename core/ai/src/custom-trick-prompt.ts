/**
 * The prompt that teaches a companion a custom trick: the parent's thinking
 * model gets the avatar's rig (bones, axes, limits, face states) and the kid's
 * words, and answers with a motion script (core/character/src/motion-script.ts).
 * Built from the catalog entry, so it only ever offers bones the avatar has.
 */
import type { CharacterModel } from "@dodi/character/character-catalog";
import { JOINT_LIMITS, LOC_LIMITS, MOTION_LIMITS, jointLimitsFor } from "@dodi/character/motion-script";

/** What each bone is, for the model to choreograph with. Unknown bones get a generic line. */
const BONE_HINTS: Record<string, string> = {
  root: "the whole character, pivoting at its feet. Turn it to spin (Y) or flip (X); lift it (loc Y) to jump",
  body: "the torso above the hips. Lean (X forward), twist (Y), sway side to side (Z)",
  neck: "the neck, under the head",
  head: "the head. Nod (X), look left/right (Y), tilt (Z)",
  jaw: "reserved for speech, never use it",
  tail: "the tail feathers at the back. Wag with Y",
  wing_L: "the left wing (the character's own left). Raise it with +Z, flap by moving Z up and down",
  wing_R: "the right wing. Mirrors wing_L: raise it with -Z",
  arm_L: "the left arm. Raise it with +Z",
  arm_R: "the right arm. Mirrors arm_L: raise it with -Z",
  leg_L: "the left leg, at the hip",
  leg_R: "the right leg, at the hip",
  foot_L: "the left foot",
  foot_R: "the right foot",
  antenna_L: "the left antenna on top of the head (it bounces on its own too)",
  antenna_R: "the right antenna",
};

function range([lo, hi]: [number, number]): string {
  return `${lo}..${hi}`;
}

function boneLine(bone: string): string {
  const hint = BONE_HINTS[bone] ?? "a part of the character";
  if (bone === "jaw") return `- ${bone}: ${hint}`;
  const [x, y, z] = jointLimitsFor(bone);
  const loc = LOC_LIMITS[bone];
  const locPart = loc ? `; loc x ${range(loc[0])}, y ${range(loc[1])}, z ${range(loc[2])}` : "";
  return `- ${bone}: ${hint}. rot x ${range(x)}, y ${range(y)}, z ${range(z)}${locPart}`;
}

/** The system instruction for one avatar model. `languageName` is the kid's language ("German"). */
export function buildCustomTrickInstruction(model: CharacterModel, languageName: string): string {
  const examples = model.tricks.slice(0, 2).map((trick) => JSON.stringify(trick.script));
  return [
    `You choreograph short, joyful tricks for "${model.stockName}", a cartoon companion character in a kids' learning app.`,
    "A child describes a trick; you answer with ONE JSON object, a motion script, and nothing else.",
    "",
    "## Motion script format",
    "{",
    '  "v": 1,',
    `  "name": short fun name for the trick in ${languageName} (max 3 words),`,
    `  "duration": seconds, ${MOTION_LIMITS.minDuration} to ${MOTION_LIMITS.maxDuration} (most tricks: 1 to 3),`,
    '  "root_pivot": "feet" (default) or "center" (for flips and somersaults, so it turns around its belly),',
    `  "poses": up to ${MOTION_LIMITS.maxPoses} poses, each { "t": seconds, "bones": { "<bone>": { "rot": [x, y, z], "loc": [x, y, z] } }, "face": { "eyes": ..., "mouth": ... } }`,
    "}",
    "",
    "## Rules",
    "- The character starts and ends in its rest pose (all zeros); you only list the poses in between.",
    `- Pose times strictly increase, at least ${MOTION_LIMITS.minGap}s apart, all within the duration.`,
    `- At most ${MOTION_LIMITS.maxBonesPerPose} bones per pose. A bone keeps moving smoothly between the poses that name it.`,
    "- rot is in degrees in the character's own frame: X tips forward/back (positive nods forward), Y turns (positive turns to its own left), Z rolls sideways. They apply turn (Y), then nod (X), then roll (Z).",
    "- Right-side bones (_R) mirror their left twin: use the same X, and negate Y and Z for a symmetric move.",
    "- loc (model units, the character is about 1 tall) only works on root and body. Lift root on Y to jump; keep feet on the ground otherwise.",
    "- A full spin is root rot Y 360 (or -360). A backflip is root rot X -360 with root_pivot \"center\" and a jump.",
    `- Turning faster than ${MOTION_LIMITS.maxSpeed} degrees per second (root: ${MOTION_LIMITS.rootMaxSpeed}) gets slowed down.`,
    "- Make it lively and easy to read: a small wind-up before big moves, a happy face at the end.",
    "- If the request is unclear, impossible or not kind, make the closest playful, gentle trick instead.",
    "",
    "## Bones (with their limits; values outside get clamped)",
    ...model.bones.map(boneLine),
    "",
    "## Face",
    `- eyes: ${model.face.eyes.join(", ")} (default "${model.face.eyes[0]}")`,
    `- mouth: ${model.face.mouth.join(", ")} (default "${model.face.mouth[0]}")`,
    "- A face cue holds until the next one for that part; the rest face returns at the end.",
    "",
    "## Examples",
    ...examples,
  ].join("\n");
}

/** The user turn: the kid's words, plus what was wrong with the last try. */
export function buildCustomTrickPrompt(description: string, issues: readonly string[] = []): string {
  const lines = [`The child asks: "${description.trim()}"`];
  if (issues.length > 0) {
    lines.push("", "Your last answer was not a valid motion script:", ...issues.map((i) => `- ${i}`), "Answer again with a corrected JSON object.");
  }
  return lines.join("\n");
}

/** The joint-limit table, re-exported for docs and tests. */
export const CUSTOM_TRICK_LIMITS = { JOINT_LIMITS, LOC_LIMITS, MOTION_LIMITS } as const;
