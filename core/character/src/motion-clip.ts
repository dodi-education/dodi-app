import * as THREE from "three";

import { bonesOf, channelKeys, type ChannelKey, type MotionScript, type Vec3 } from "./motion-script";

/**
 * Turns a fitted motion script (motion-script.ts) into a one-shot animation
 * clip for the character's mixer. Every rig bone and every face morph is keyed
 * (bones the script doesn't move hold their rest pose), so the trick fully
 * owns the pose while it plays and cross-fades cleanly against the loops.
 *
 * Between poses each channel follows a monotone cubic (no overshoot past a
 * pose, so joint limits hold), eased in and out at the ends, sampled at 30 fps
 * so full turns stay correct in quaternions.
 */

export const MOTION_FPS = 30;
const FACE_BLEND_SECONDS = 0.1;

/** What the clip needs to know about the loaded character. */
export interface MotionRig {
  /** Rig bone name → the three.js node it animates. */
  bones: ReadonlyMap<string, THREE.Object3D>;
  /** Rest pose per rig bone, snapshotted before any clip ran. */
  rest: ReadonlyMap<string, { position: THREE.Vector3; quaternion: THREE.Quaternion }>;
  /** The face mesh holding the expression morph targets (`eyes_closed`, ...). */
  face: THREE.Mesh | null;
  /** Height of the body's centre above the feet: the pivot for `root_pivot: "center"`. */
  centerHeight: number;
}

/** Monotone cubic Hermite (Fritsch-Carlson) through the keys, flat at both ends. */
function monotoneSampler(times: number[], values: number[]): (t: number) => number {
  const n = times.length;
  if (n === 1) return () => values[0];
  const slopes: number[] = [];
  for (let i = 0; i < n - 1; i++) slopes.push((values[i + 1] - values[i]) / (times[i + 1] - times[i]));
  const tangents = new Array<number>(n).fill(0);
  for (let i = 1; i < n - 1; i++) {
    if (slopes[i - 1] * slopes[i] <= 0) continue;
    const h0 = times[i] - times[i - 1];
    const h1 = times[i + 1] - times[i];
    const w0 = 2 * h1 + h0;
    const w1 = h1 + 2 * h0;
    tangents[i] = (w0 + w1) / (w0 / slopes[i - 1] + w1 / slopes[i]);
  }
  return (t) => {
    if (t <= times[0]) return values[0];
    if (t >= times[n - 1]) return values[n - 1];
    let i = 0;
    while (i < n - 2 && t > times[i + 1]) i++;
    const h = times[i + 1] - times[i];
    const s = (t - times[i]) / h;
    const s2 = s * s;
    const s3 = s2 * s;
    return (
      (2 * s3 - 3 * s2 + 1) * values[i] +
      (s3 - 2 * s2 + s) * h * tangents[i] +
      (-2 * s3 + 3 * s2) * values[i + 1] +
      (s3 - s2) * h * tangents[i + 1]
    );
  };
}

function vecSampler(keys: ChannelKey[]): (t: number) => Vec3 {
  if (keys.length === 0) return () => [0, 0, 0];
  const times = keys.map((k) => k.t);
  const axes = [0, 1, 2].map((axis) => monotoneSampler(times, keys.map((k) => k.value[axis])));
  return (t) => [axes[0](t), axes[1](t), axes[2](t)];
}

const DEG = Math.PI / 180;

/** Yaw (Y), then pitch (X), then roll (Z), in degrees. */
export function motionRotation([x, y, z]: Vec3, target = new THREE.Quaternion()): THREE.Quaternion {
  return target.setFromEuler(new THREE.Euler(x * DEG, y * DEG, z * DEG, "YXZ"));
}

function frameTimes(duration: number): number[] {
  const count = Math.max(2, Math.round(duration * MOTION_FPS) + 1);
  return Array.from({ length: count }, (_, i) => (i === count - 1 ? duration : i / MOTION_FPS));
}

/**
 * The face's morph weights over time: each cue switches its part (eyes or
 * mouth) to the named state with a short blend; the default states are all
 * zero. Returns one weight array per frame, in morphTargetDictionary order.
 */
function faceWeights(script: MotionScript, face: THREE.Mesh, times: number[]): number[][] {
  const dictionary = face.morphTargetDictionary ?? {};
  const targets = Object.entries(dictionary).sort(([, a], [, b]) => a - b).map(([name]) => name);
  const cues: { t: number; part: "eyes" | "mouth"; state: string }[] = [];
  for (const pose of script.poses) {
    if (pose.face?.eyes) cues.push({ t: pose.t, part: "eyes", state: pose.face.eyes });
    if (pose.face?.mouth) cues.push({ t: pose.t, part: "mouth", state: pose.face.mouth });
  }
  const weightOf = (target: string, t: number): number => {
    const [part, ...rest] = target.split("_");
    const state = rest.join("_");
    let weight = 0;
    for (const cue of cues) {
      if (cue.part !== part || cue.t > t) continue;
      const blend = Math.min(1, (t - cue.t) / FACE_BLEND_SECONDS);
      const goal = cue.state === state ? 1 : 0;
      weight += (goal - weight) * blend;
    }
    return weight;
  };
  // The rest face returns at the end, like the rest pose.
  const fadeOutFrom = script.duration - FACE_BLEND_SECONDS * 2;
  return times.map((t) => {
    const fade = t <= fadeOutFrom ? 1 : Math.max(0, (script.duration - t) / (FACE_BLEND_SECONDS * 2));
    return targets.map((target) => weightOf(target, t) * fade);
  });
}

/** Builds the clip. Bones the rig lacks were already dropped by fitMotionScript. */
export function buildMotionClip(script: MotionScript, rig: MotionRig, name = `motion:${script.name}`): THREE.AnimationClip {
  const times = frameTimes(script.duration);
  const tracks: THREE.KeyframeTrack[] = [];
  const moved = new Set(bonesOf(script));
  const centre = new THREE.Vector3(0, rig.centerHeight, 0);
  const delta = new THREE.Quaternion();
  const previous = new THREE.Quaternion();
  const pivot = new THREE.Vector3();

  for (const [bone, node] of rig.bones) {
    const rest = rig.rest.get(bone);
    if (!rest) continue;
    const rot = vecSampler(moved.has(bone) ? channelKeys(script, bone, "rot") : []);
    const loc = vecSampler(moved.has(bone) ? channelKeys(script, bone, "loc") : []);
    const quaternions: number[] = [];
    const positions: number[] = [];
    times.forEach((t, frame) => {
      motionRotation(rot(t), delta);
      const q = rest.quaternion.clone().multiply(delta);
      // Neighbouring samples on the same side, so interpolation takes the short way.
      if (frame > 0 && previous.dot(q) < 0) q.set(-q.x, -q.y, -q.z, -q.w);
      previous.copy(q);
      quaternions.push(q.x, q.y, q.z, q.w);

      const [x, y, z] = loc(t);
      const position = rest.position.clone().add(new THREE.Vector3(x, y, z));
      if (bone === "root" && script.root_pivot === "center") {
        // Turn about the body's centre instead of the feet: c − R·c.
        pivot.copy(centre).applyQuaternion(delta);
        position.add(centre).sub(pivot);
      }
      positions.push(position.x, position.y, position.z);
    });
    tracks.push(new THREE.QuaternionKeyframeTrack(`${node.name}.quaternion`, times, quaternions));
    tracks.push(new THREE.VectorKeyframeTrack(`${node.name}.position`, times, positions));
  }

  if (rig.face?.morphTargetDictionary) {
    const weights = faceWeights(script, rig.face, times);
    tracks.push(new THREE.NumberKeyframeTrack(`${rig.face.name}.morphTargetInfluences`, times, weights.flat()));
  }
  return new THREE.AnimationClip(name, script.duration, tracks);
}
