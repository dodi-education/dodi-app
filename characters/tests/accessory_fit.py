"""An accessory must sit on its character: touching, not buried, clear of other parts.

    blender --background --python-exit-code 1 --python characters/tests/accessory_fit.py \\
        [-- CHARACTER.glb ACCESSORY.glb [CLIP ...]]

Imports the character and each accessory and combines them the way the app
will (the accessory's origin on the socket its manifest names), then checks,
at rest, through every clip (sampled over its whole loop) and with the jaw
wide open:

- it touches the head: its closest point is within TOUCH of the skin;
- nothing of it is buried deeper than BURIED in any part of the character
  (cushions and rims may press in a little, by design);
- it keeps CLEARANCE from the antennae, the rigid parts it could collide with;
- a part whose node extras carry ``clearance`` (metres) keeps at least that
  gap from the character's skin, e.g. the glasses' rims in front of the face.

Defaults to the stock dodi with every accessory in ``characters/accessories``,
through all the clips in its manifest.
"""

from __future__ import annotations

import glob
import json
import math
import os
import sys

import bpy
from mathutils import Euler
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "blender"))

import kit  # noqa: E402

TOUCH = 0.003
BURIED = 0.006
CLEARANCE = 0.003
FPS = 30
SAMPLES = 8  # poses per clip, spread evenly over its loop


def arguments() -> tuple[str, list[str], list[str]]:
    rest = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    character = rest[0] if len(rest) > 0 else os.path.join(HERE, "..", "dodi", "dodi.glb")
    if len(rest) > 1:
        accessories = [rest[1]]
    else:
        accessories = sorted(glob.glob(os.path.join(HERE, "..", "accessories", "*", "*.glb")))
    clips = rest[2:]  # empty: every clip in the character's manifest
    return os.path.abspath(character), [os.path.abspath(a) for a in accessories], clips


def poses(clips: list[str]) -> list[tuple[str | None, float, float]]:
    """(clip, frame, jaw degrees): rest, each clip across its loop, and talk with the jaw wide open."""
    manifest = json.loads(bpy.context.scene["character"])
    out: list[tuple[str | None, float, float]] = [(None, 0.0, 0.0)]
    for clip in clips:
        start, end = bpy.data.actions[clip].frame_range
        out += [(clip, start + (end - start) * i / SAMPLES, 0.0) for i in range(SAMPLES)]
    jaw = manifest.get("jaw")
    if jaw and "talk" in clips:
        start, end = bpy.data.actions["talk"].frame_range
        out += [("talk", start + (end - start) * i / 4, float(jaw["open_degrees"])) for i in range(4)]
    return out


def play(clip: str | None, frame: float, jaw: float = 0.0) -> None:
    """Pose the imported character at a clip's time (or at rest)."""
    scene = bpy.context.scene
    arm = next(o for o in scene.objects if o.type == "ARMATURE")
    keys = next((o.data.shape_keys for o in scene.objects if o.type == "MESH" and o.data.shape_keys), None)
    owners = [(arm, "OB")] + ([(keys, "KE")] if keys else [])
    for owner, prefix in owners:
        anim = owner.animation_data or owner.animation_data_create()
        for track in anim.nla_tracks:
            track.mute = True
        anim.action = bpy.data.actions[clip] if clip else None
        if clip:
            anim.action_slot = next((s for s in anim.action.slots if s.identifier.startswith(prefix)), None)
    if not clip:
        kit.rest_pose(arm)
    scene.frame_set(round(frame))
    if jaw and "jaw" in arm.pose.bones:
        # The voice-driven jaw, written over the clip like the runtime does.
        bone = arm.pose.bones["jaw"]
        bone.rotation_mode = "QUATERNION"
        bone.rotation_quaternion = Euler((math.radians(jaw), 0.0, 0.0)).to_quaternion()
    bpy.context.view_layer.update()


def surface(objects: list[bpy.types.Object]) -> BVHTree:
    """One world-space tree over the evaluated (posed) meshes."""
    return surface_owned(objects)[0]


def surface_owned(objects: list[bpy.types.Object]) -> tuple[BVHTree, list[str]]:
    """The tree plus, per polygon, the name of the part it belongs to (to say what an accessory hits)."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    verts, polys, owners = [], [], []
    for obj in objects:
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        base = len(verts)
        verts += [obj.matrix_world @ v.co for v in mesh.vertices]
        polys += [[base + i for i in p.vertices] for p in mesh.polygons]
        owners += [obj.name] * len(mesh.polygons)
        evaluated.to_mesh_clear()
    return BVHTree.FromPolygons(verts, polys), owners


def points(objects: list[bpy.types.Object]) -> list:
    return [p for p, _name in named_points(objects)]


def named_points(objects: list[bpy.types.Object]) -> list:
    """(world position, accessory part name) for every evaluated vertex."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    out = []
    for obj in objects:
        evaluated = obj.evaluated_get(depsgraph)
        out += [(obj.matrix_world @ v.co, obj.name) for v in evaluated.to_mesh().vertices]
        evaluated.to_mesh_clear()
    return out


def check(accessory_path: str, character: list, all_poses: list) -> int:
    """Attach one accessory, check every pose, take it off again. Returns the failing pose count."""
    root, manifest = kit.attach_accessory(accessory_path)
    accessory = [o for o in root.children_recursive if o.type == "MESH"]
    kept = [(o, float(o["clearance"])) for o in accessory if "clearance" in o]
    skin = [o for o in character if not all(m.get("unlit") for m in o.data.materials)]  # not the face pictures
    head = [o for o in skin if o.name in ("head", "hood")]
    antennae = [o for o in skin if o.name.startswith("antenna")]

    failures = 0
    for clip, frame, jaw in all_poses:
        play(clip, frame, jaw)
        near_head, rods = surface(head), surface(antennae) if antennae else None
        anywhere, owners = surface_owned(skin)
        touch, buried, clearance, culprit = 1.0, 0.0, 1.0, ""
        for p, part in named_points(accessory):
            location, normal, _index, dist = near_head.find_nearest(p)
            touch = min(touch, dist)
            location, normal, index, dist = anywhere.find_nearest(p)
            depth = (p - location).dot(normal)
            if depth < buried:
                buried, culprit = depth, f"its {part} into the {owners[index]}"
            if rods is not None:
                clearance = min(clearance, rods.find_nearest(p)[3])
        problems = []
        if touch > TOUCH:
            problems.append(f"floats {touch * 1000:.1f} mm off the head")
        if buried < -BURIED:
            problems.append(f"sinks {-buried * 1000:.1f} mm into the character ({culprit})")
        if rods is not None and clearance < CLEARANCE:
            problems.append(f"only {clearance * 1000:.1f} mm from an antenna")
        gaps = []
        for part, wanted in kept:
            gap = min(anywhere.find_nearest(p)[3] for p in points([part]))
            gaps.append(f"{part.name} {gap * 1000:.1f} mm")
            if gap < wanted:
                problems.append(f"{part.name} only {gap * 1000:.1f} mm from the skin (wants {wanted * 1000:.1f})")
        where = "rest" if clip is None else f"{clip} @ {frame / FPS:.1f}s" + (f", jaw {jaw:.0f}°" if jaw else "")
        failures += bool(problems)
        detail = "; ".join(problems) or (
            f"touches ({touch * 1000:.1f} mm), deepest {-buried * 1000:.1f} mm, antennae {clearance * 1000:.0f} mm away"
            + (f", {', '.join(gaps)} clear" if gaps else "")
        )
        print(f"{'FAIL' if problems else 'PASS'}  {manifest['name']} on {manifest['socket']}, {where}: {detail}")
    for obj in [root, *root.children_recursive]:
        bpy.data.objects.remove(obj, do_unlink=True)
    return failures


def main() -> int:
    character_path, accessory_paths, clips = arguments()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=character_path)
    character = [o for o in bpy.context.scene.objects if o.type == "MESH" and o.data.materials and o.data.materials[0]]
    clips = clips or json.loads(bpy.context.scene["character"])["clips"]
    all_poses = poses(clips)
    failures = sum(check(path, character, all_poses) for path in accessory_paths)
    print(f"{failures} failing pose(s) across {len(accessory_paths)} accessor{'y' if len(accessory_paths) == 1 else 'ies'}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
