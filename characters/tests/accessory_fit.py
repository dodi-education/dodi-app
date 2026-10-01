"""An accessory must sit on its character: touching, not buried, clear of other parts.

    blender --background --python-exit-code 1 --python characters/tests/accessory_fit.py \\
        [-- CHARACTER.glb ACCESSORY.glb [CLIP ...]]

Imports the character and the accessory and combines them the way the app
will (the accessory's origin on the socket its manifest names), then checks,
at rest and through the clips it is worn in:

- it touches the head: its closest point is within TOUCH of the skin;
- nothing of it is buried deeper than BURIED in any part of the character
  (cushions may press in a little, by design);
- it keeps CLEARANCE from the antennae, the rigid parts it could collide with.

Defaults to the stock dodi, the headphones and the deaf clip.
"""

from __future__ import annotations

import os
import sys

import bpy
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "blender"))

import kit  # noqa: E402

TOUCH = 0.003
BURIED = 0.006
CLEARANCE = 0.003
FPS = 30
TIMES = (0.0, 0.3, 0.6, 0.9, 1.2)


def arguments() -> tuple[str, str, list[str]]:
    rest = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    character = rest[0] if len(rest) > 0 else os.path.join(HERE, "..", "dodi", "dodi.glb")
    accessory = rest[1] if len(rest) > 1 else os.path.join(HERE, "..", "accessories", "headphones", "headphones.glb")
    clips = rest[2:] or ["deaf"]
    return os.path.abspath(character), os.path.abspath(accessory), clips


def play(clip: str | None, seconds: float) -> None:
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
    scene.frame_set(round(seconds * FPS))
    bpy.context.view_layer.update()


def surface(objects: list[bpy.types.Object]) -> BVHTree:
    """One world-space tree over the evaluated (posed) meshes."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    verts, polys = [], []
    for obj in objects:
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        base = len(verts)
        verts += [obj.matrix_world @ v.co for v in mesh.vertices]
        polys += [[base + i for i in p.vertices] for p in mesh.polygons]
        evaluated.to_mesh_clear()
    return BVHTree.FromPolygons(verts, polys)


def points(objects: list[bpy.types.Object]) -> list:
    depsgraph = bpy.context.evaluated_depsgraph_get()
    out = []
    for obj in objects:
        evaluated = obj.evaluated_get(depsgraph)
        out += [obj.matrix_world @ v.co for v in evaluated.to_mesh().vertices]
        evaluated.to_mesh_clear()
    return out


def main() -> int:
    character_path, accessory_path, clips = arguments()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=character_path)
    character = [o for o in bpy.context.scene.objects if o.type == "MESH" and o.data.materials and o.data.materials[0]]
    root, manifest = kit.attach_accessory(accessory_path)
    accessory = [o for o in root.children_recursive if o.type == "MESH"]
    skin = [o for o in character if not all(m.get("unlit") for m in o.data.materials)]  # not the face pictures
    head = [o for o in skin if o.name in ("head", "hood")]
    antennae = [o for o in skin if o.name.startswith("antenna")]

    failures = 0
    for clip, seconds in [(None, 0.0)] + [(c, t) for c in clips for t in TIMES]:
        play(clip, seconds)
        near_head, anywhere, rods = surface(head), surface(skin), surface(antennae) if antennae else None
        touch, buried, clearance = 1.0, 0.0, 1.0
        for p in points(accessory):
            location, normal, _index, dist = near_head.find_nearest(p)
            touch = min(touch, dist)
            location, normal, _index, dist = anywhere.find_nearest(p)
            buried = min(buried, (p - location).dot(normal))
            if rods is not None:
                clearance = min(clearance, rods.find_nearest(p)[3])
        problems = []
        if touch > TOUCH:
            problems.append(f"floats {touch * 1000:.1f} mm off the head")
        if buried < -BURIED:
            problems.append(f"sinks {-buried * 1000:.1f} mm into the character")
        if rods is not None and clearance < CLEARANCE:
            problems.append(f"only {clearance * 1000:.1f} mm from an antenna")
        where = "rest" if clip is None else f"{clip} @ {seconds:.1f}s"
        failures += bool(problems)
        detail = "; ".join(problems) or f"touches ({touch * 1000:.1f} mm), deepest {-buried * 1000:.1f} mm, antennae {clearance * 1000:.0f} mm away"
        print(f"{'FAIL' if problems else 'PASS'}  {manifest['name']} on {manifest['socket']}, {where}: {detail}")
    print(f"{failures} failing pose(s)")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
