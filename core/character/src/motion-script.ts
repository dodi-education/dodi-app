import { z } from "zod/v4";

import type { CharacterModel } from "./character-catalog";

/**
 * Motion scripts: a trick as data. A short list of poses over time, each
 * naming a few bones and their rotation (degrees) and, for `root` / `body`, an
 * offset. Built-in tricks are written in it, and an AI writes kids' custom
 * tricks in it; `motion-clip.ts` turns one into an animation clip. Pure (no
 * three.js).
 *
 * Axes follow the character format (characters/README.md): every bone's rest
 * rotation is identity in the character's frame, X is left/right (positive
 * nods forward), Y is up (positive turns to the character's own left), Z is
 * forward. Right-side bones (`*_R`) mirror the Y and Z signs of their left
 * twin, so a symmetric move uses the same X and negated Y/Z. Rotations apply
 * yaw (Y), then pitch (X), then roll (Z).
 *
 * The rest pose is implied at the start and the end: a script only lists the
 * poses in between (it may still pin t=0 or t=duration itself).
 */

export const MOTION_LIMITS = {
  minDuration: 0.5,
  maxDuration: 6,
  maxPoses: 16,
  maxBonesPerPose: 10,
  /** Seconds between two poses at least. */
  minGap: 0.08,
  /** Degrees per second a bone may turn at most (root: ROOT_MAX_SPEED). */
  maxSpeed: 720,
  rootMaxSpeed: 1080,
} as const;

const Vec3 = z.tuple([z.number(), z.number(), z.number()]);

const BonePoseSchema = z.object({
  rot: Vec3.optional(),
  loc: Vec3.optional(),
});

const PoseSchema = z.object({
  t: z.number().min(0),
  bones: z.record(z.string(), BonePoseSchema).default({}),
  face: z
    .object({
      eyes: z.string().optional(),
      mouth: z.string().optional(),
    })
    .optional(),
});

export const MotionScriptSchema = z
  .object({
    v: z.literal(1),
    name: z.string().trim().min(1).max(40),
    duration: z.number().min(MOTION_LIMITS.minDuration).max(MOTION_LIMITS.maxDuration),
    root_pivot: z.enum(["feet", "center"]).default("feet"),
    poses: z.array(PoseSchema).min(1).max(MOTION_LIMITS.maxPoses),
  })
  .superRefine((script, ctx) => {
    let previous = -Infinity;
    script.poses.forEach((pose, i) => {
      if (pose.t > script.duration) {
        ctx.addIssue({ code: "custom", path: ["poses", i, "t"], message: "pose time is past the duration" });
      }
      if (pose.t <= previous) {
        ctx.addIssue({ code: "custom", path: ["poses", i, "t"], message: "pose times must increase" });
      } else if (pose.t - previous < MOTION_LIMITS.minGap) {
        ctx.addIssue({
          code: "custom",
          path: ["poses", i, "t"],
          message: `poses must be at least ${MOTION_LIMITS.minGap}s apart`,
        });
      }
      if (Object.keys(pose.bones).length > MOTION_LIMITS.maxBonesPerPose) {
        ctx.addIssue({
          code: "custom",
          path: ["poses", i, "bones"],
          message: `at most ${MOTION_LIMITS.maxBonesPerPose} bones per pose`,
        });
      }
      previous = pose.t;
    });
  });

export type MotionScript = z.output<typeof MotionScriptSchema>;
export type MotionPose = MotionScript["poses"][number];
export type Vec3 = [number, number, number];

type Range = [number, number];

/**
 * Joint limits (degrees, per X/Y/Z) for the centre and left-side bones. A `_R`
 * bone uses its `_L` twin's limits with Y and Z mirrored. Rig bones not listed
 * get GENERIC_LIMIT.
 */
export const JOINT_LIMITS: Record<string, [Range, Range, Range]> = {
  root: [[-720, 720], [-720, 720], [-720, 720]],
  body: [[-45, 45], [-60, 60], [-30, 30]],
  neck: [[-30, 30], [-45, 45], [-25, 25]],
  head: [[-35, 35], [-70, 70], [-30, 30]],
  tail: [[-40, 40], [-40, 40], [-30, 30]],
  wing_L: [[-60, 60], [-45, 45], [-20, 120]],
  arm_L: [[-90, 90], [-60, 60], [-20, 150]],
  leg_L: [[-50, 50], [-20, 20], [-20, 20]],
  foot_L: [[-40, 40], [-20, 20], [-20, 20]],
  antenna_L: [[-30, 30], [-20, 20], [-30, 30]],
};
const GENERIC_LIMIT: [Range, Range, Range] = [[-60, 60], [-60, 60], [-60, 60]];

/** Offsets (model units) only root and body may move by. */
export const LOC_LIMITS: Record<string, [Range, Range, Range]> = {
  root: [[-0.3, 0.3], [-0.03, 0.45], [-0.3, 0.3]],
  body: [[-0.05, 0.05], [-0.05, 0.05], [-0.05, 0.05]],
};

/** Bones a trick never moves: the voice owns the jaw. */
const RESERVED_BONES = new Set(["jaw"]);

export function jointLimitsFor(bone: string): [Range, Range, Range] {
  const direct = JOINT_LIMITS[bone];
  if (direct) return direct;
  if (bone.endsWith("_R")) {
    const twin = JOINT_LIMITS[`${bone.slice(0, -2)}_L`];
    if (twin) {
      const mirror = ([lo, hi]: Range): Range => [-hi, -lo];
      return [twin[0], mirror(twin[1]), mirror(twin[2])];
    }
  }
  return GENERIC_LIMIT;
}

function clamp(value: number, [lo, hi]: Range): number {
  return Math.min(hi, Math.max(lo, value));
}

function clampVec(v: Vec3, limits: [Range, Range, Range]): { value: Vec3; isClamped: boolean } {
  const value = v.map((c, i) => clamp(c, limits[i])) as Vec3;
  return { value, isClamped: value.some((c, i) => c !== v[i]) };
}

export interface FittedMotion {
  script: MotionScript;
  /** Bones the trick moves; a model without one of them can't perform it. */
  requiredBones: string[];
  /** What was dropped or clamped, for logs and a retry prompt. */
  warnings: string[];
}

/**
 * Fits a structurally valid script to a model: drops bones the rig lacks and
 * the jaw, drops offsets on bones other than root/body, clamps rotations and
 * offsets to the limits, drops face states the model lacks, and slows the
 * whole trick down when a bone would have to turn faster than allowed.
 */
export function fitMotionScript(input: MotionScript, model: CharacterModel): FittedMotion {
  const rig = new Set(model.bones);
  const warnings: string[] = [];
  const used = new Set<string>();
  const warnOnce = new Set<string>();
  const warn = (message: string): void => {
    if (warnOnce.has(message)) return;
    warnOnce.add(message);
    warnings.push(message);
  };

  const poses: MotionPose[] = input.poses.map((pose) => {
    const bones: MotionPose["bones"] = {};
    for (const [bone, value] of Object.entries(pose.bones)) {
      if (RESERVED_BONES.has(bone)) {
        warn(`"${bone}" is reserved and was ignored`);
        continue;
      }
      if (!rig.has(bone)) {
        warn(`this character has no "${bone}" bone`);
        continue;
      }
      const fitted: { rot?: Vec3; loc?: Vec3 } = {};
      if (value.rot) {
        const { value: rot, isClamped } = clampVec(value.rot, jointLimitsFor(bone));
        if (isClamped) warn(`"${bone}" turned past its limits and was clamped`);
        fitted.rot = rot;
      }
      if (value.loc) {
        const limits = LOC_LIMITS[bone];
        if (!limits) {
          warn(`only root and body can move; "${bone}" offset ignored`);
        } else {
          const { value: loc, isClamped } = clampVec(value.loc, limits);
          if (isClamped) warn(`"${bone}" moved too far and was clamped`);
          fitted.loc = loc;
        }
      }
      if (fitted.rot || fitted.loc) {
        bones[bone] = fitted;
        used.add(bone);
      }
    }
    let face: MotionPose["face"];
    if (pose.face) {
      face = {};
      if (pose.face.eyes !== undefined) {
        if (model.face.eyes.includes(pose.face.eyes)) face.eyes = pose.face.eyes;
        else warn(`no eyes state "${pose.face.eyes}"`);
      }
      if (pose.face.mouth !== undefined) {
        if (model.face.mouth.includes(pose.face.mouth)) face.mouth = pose.face.mouth;
        else warn(`no mouth state "${pose.face.mouth}"`);
      }
      if (face.eyes === undefined && face.mouth === undefined) face = undefined;
    }
    return face ? { t: pose.t, bones, face } : { t: pose.t, bones };
  });

  const stretch = speedStretch({ ...input, poses });
  let script: MotionScript = { ...input, poses };
  if (stretch > 1) {
    const duration = Math.min(MOTION_LIMITS.maxDuration, input.duration * stretch);
    const factor = duration / input.duration;
    script = { ...script, duration, poses: poses.map((p) => ({ ...p, t: p.t * factor })) };
    warn("the trick was too fast and was slowed down");
  }
  return { script, requiredBones: [...used].sort(), warnings };
}

/** How much longer the trick must take so no bone turns faster than allowed. */
function speedStretch(script: MotionScript): number {
  let stretch = 1;
  for (const bone of bonesOf(script)) {
    const keys = channelKeys(script, bone, "rot");
    const limit = bone === "root" ? MOTION_LIMITS.rootMaxSpeed : MOTION_LIMITS.maxSpeed;
    for (let i = 1; i < keys.length; i++) {
      const dt = keys[i].t - keys[i - 1].t;
      if (dt <= 0) continue;
      const turn = Math.max(...keys[i].value.map((c, axis) => Math.abs(c - keys[i - 1].value[axis])));
      stretch = Math.max(stretch, turn / dt / limit);
    }
  }
  return stretch;
}

export function bonesOf(script: MotionScript): string[] {
  const bones = new Set<string>();
  for (const pose of script.poses) for (const bone of Object.keys(pose.bones)) bones.add(bone);
  return [...bones];
}

export interface ChannelKey {
  t: number;
  value: Vec3;
}

/**
 * A bone channel's keys with the rest pose implied at both ends: rest at 0 and
 * at the duration unless a pose pins that time itself. A full turn looks like
 * rest, so the implied end of a rotation is the nearest whole turn (a 360°
 * spin ends at 360°, not by spinning back).
 */
export function channelKeys(script: MotionScript, bone: string, channel: "rot" | "loc"): ChannelKey[] {
  const keys: ChannelKey[] = [];
  for (const pose of script.poses) {
    const value = pose.bones[bone]?.[channel];
    if (value) keys.push({ t: pose.t, value: [...value] as Vec3 });
  }
  if (keys.length === 0) return keys;
  if (keys[0].t > 0) keys.unshift({ t: 0, value: [0, 0, 0] });
  const last = keys[keys.length - 1];
  if (last.t < script.duration) {
    const value = channel === "rot" ? (last.value.map((c) => Math.round(c / 360) * 360 || 0) as Vec3) : ([0, 0, 0] as Vec3);
    keys.push({ t: script.duration, value });
  }
  return keys;
}

export type ParsedMotion =
  | { ok: true; motion: FittedMotion }
  | { ok: false; issues: string[] };

/** Parses untrusted JSON (an AI's answer, a stored trick) and fits it to the model. */
export function parseMotionScript(raw: unknown, model: CharacterModel): ParsedMotion {
  const result = MotionScriptSchema.safeParse(raw);
  if (!result.success) {
    return {
      ok: false,
      issues: result.error.issues.map((issue) => `${issue.path.join(".") || "script"}: ${issue.message}`),
    };
  }
  const motion = fitMotionScript(result.data, model);
  if (motion.requiredBones.length === 0) {
    return { ok: false, issues: ["the trick moves no bone this character has"] };
  }
  return { ok: true, motion };
}
