import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { buildMotionClip, motionRotation, type MotionRig } from "./motion-clip";
import { MotionScriptSchema, type MotionScript } from "./motion-script";

/** A tiny stand-in rig: root at the feet, body above it, a face with morphs. */
function fakeRig(): MotionRig {
  const root = new THREE.Bone();
  root.name = "root";
  const body = new THREE.Bone();
  body.name = "body";
  body.position.set(0, 0.3, 0);
  root.add(body);
  const face = new THREE.Mesh(new THREE.BufferGeometry());
  face.name = "face";
  face.morphTargetDictionary = { eyes_closed: 0, eyes_happy: 1, mouth_frown: 2 };
  face.morphTargetInfluences = [0, 0, 0];
  const bones = new Map<string, THREE.Object3D>([
    ["root", root],
    ["body", body],
  ]);
  const rest = new Map([...bones].map(([n, b]) => [n, { position: b.position.clone(), quaternion: b.quaternion.clone() }]));
  return { bones, rest, face, centerHeight: 0.45 };
}

function parse(raw: unknown): MotionScript {
  return MotionScriptSchema.parse(raw);
}

function trackNamed(clip: THREE.AnimationClip, name: string): THREE.KeyframeTrack {
  const track = clip.tracks.find((t) => t.name === name);
  if (!track) throw new Error(`no track ${name}`);
  return track;
}

/** Yaw angle (degrees, unwrapped by the caller) of a quaternion sample. */
function yawOf(values: ArrayLike<number>, frame: number): number {
  const q = new THREE.Quaternion(values[frame * 4], values[frame * 4 + 1], values[frame * 4 + 2], values[frame * 4 + 3]);
  return (new THREE.Euler().setFromQuaternion(q, "YXZ").y * 180) / Math.PI;
}

describe("buildMotionClip", () => {
  it("keys every rig bone and the face, for the script's duration", () => {
    const clip = buildMotionClip(parse({ v: 1, name: "Nod", duration: 1, poses: [{ t: 0.5, bones: { body: { rot: [20, 0, 0] } } }] }), fakeRig());
    expect(clip.duration).toBe(1);
    expect(clip.tracks.map((t) => t.name).sort()).toEqual(
      ["body.position", "body.quaternion", "face.morphTargetInfluences", "root.position", "root.quaternion"].sort(),
    );
  });

  it("spins a full turn the long way, monotonically, and ends at rest", () => {
    const clip = buildMotionClip(
      parse({ v: 1, name: "Spin", duration: 1.2, poses: [{ t: 1, bones: { root: { rot: [0, 360, 0] } } }] }),
      fakeRig(),
    );
    const track = trackNamed(clip, "root.quaternion");
    const frames = track.times.length;
    let previous = 0;
    let turned = 0;
    for (let f = 1; f < frames; f++) {
      const yaw = yawOf(track.values, f);
      let step = yaw - previous;
      if (step < -180) step += 360;
      if (step > 180) step -= 360;
      expect(step).toBeGreaterThanOrEqual(-1e-6);
      turned += step;
      previous = yaw;
    }
    expect(turned).toBeCloseTo(360, 0);
    // Neighbouring samples are on the same side (short-way slerp between them).
    for (let f = 1; f < frames; f++) {
      const dot = [0, 1, 2, 3].reduce((sum, i) => sum + track.values[f * 4 + i] * track.values[(f - 1) * 4 + i], 0);
      expect(dot).toBeGreaterThan(0);
    }
  });

  it("flips about the body's centre when asked, keeping the centre in place", () => {
    const rig = fakeRig();
    const clip = buildMotionClip(
      parse({ v: 1, name: "Flip", duration: 1, root_pivot: "center", poses: [{ t: 0.5, bones: { root: { rot: [-180, 0, 0] } } }] }),
      rig,
    );
    const rot = trackNamed(clip, "root.quaternion");
    const pos = trackNamed(clip, "root.position");
    const centre = new THREE.Vector3(0, rig.centerHeight, 0);
    for (let f = 0; f < rot.times.length; f++) {
      const q = new THREE.Quaternion().fromArray(Array.from(rot.values.slice(f * 4, f * 4 + 4)));
      const p = new THREE.Vector3().fromArray(Array.from(pos.values.slice(f * 3, f * 3 + 3)));
      const movedCentre = centre.clone().applyQuaternion(q).add(p);
      expect(movedCentre.distanceTo(centre)).toBeLessThan(1e-6);
    }
  });

  it("adds offsets to the rest position", () => {
    const clip = buildMotionClip(
      parse({ v: 1, name: "Bob", duration: 1, poses: [{ t: 0.5, bones: { body: { loc: [0, 0.02, 0] } } }] }),
      fakeRig(),
    );
    const pos = trackNamed(clip, "body.position");
    const mid = pos.times.findIndex((t) => Math.abs(t - 0.5) < 1e-6);
    expect(pos.values[mid * 3 + 1]).toBeCloseTo(0.32, 6);
    expect(pos.values[1]).toBeCloseTo(0.3, 6);
  });

  it("switches the face with the cues and returns to rest at the end", () => {
    const clip = buildMotionClip(
      parse({
        v: 1,
        name: "Wink",
        duration: 1,
        poses: [{ t: 0.2, bones: { body: { rot: [5, 0, 0] } }, face: { eyes: "happy" } }],
      }),
      fakeRig(),
    );
    const face = trackNamed(clip, "face.morphTargetInfluences");
    const at = (t: number): number[] => {
      const f = face.times.findIndex((time) => Math.abs(time - t) < 1e-6);
      return Array.from(face.values.slice(f * 3, f * 3 + 3));
    };
    expect(at(0)).toEqual([0, 0, 0]);
    expect(at(0.5)[1]).toBeCloseTo(1, 6);
    expect(at(1)).toEqual([0, 0, 0]);
  });
});

describe("motionRotation", () => {
  it("applies yaw, then pitch, then roll", () => {
    const q = motionRotation([90, 90, 0]);
    // Yaw 90 turns +Z (forward) to +X; pitching then nods it down about the turned X axis.
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    expect(forward.x).toBeCloseTo(0, 6);
    expect(Math.abs(forward.y)).toBeCloseTo(1, 6);
  });
});
