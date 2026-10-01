"""An open beak must look open: see-through from the side, closed inside.

    blender --background --python-exit-code 1 --python characters/tests/mouth_open.py

Imports the exported dodi.glb, opens the jaw as far as the manifest allows
and looks into the gap, emulating a renderer that skips back faces:

- from either side, a line of sight through the middle of the gap passes
  right through (the beak is open, not bridged by a sheet);
- from the front and below, it lands on the mouth's own inner surface (the
  "mouth" material), not on the inside of a hollow head;
- from any direction it never lands on another part (neck, body, ...) or on
  a separate inlay object.

Regressions: a slit with a small dark blob behind it showed an odd inlay and
the white neck; a dark band stretched across the gap then looked like a flat
sheet from the side.
"""

from __future__ import annotations

import json
import math
import os
import sys

import bpy
from mathutils import Euler, Vector
from mathutils.bvhtree import BVHTree

GLB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "dodi", "dodi.glb")
HEAD = "head"
MOUTH_MATERIAL = "mouth"
# The mouth line in side view (y, z), as in build_dodi.GAPE, between the corner and the hook.
GAPE = [(-0.48, 0.607), (-0.44, 0.614), (-0.4, 0.62), (-0.36, 0.628), (-0.32, 0.636)]
JAW_HINGE_Y = -0.255
MIN_GAP = 0.008  # only look where the open gap is at least this tall
# Where each camera sits, seen from the head (the character faces -y, its right is -x),
# and what a line of sight through the gap must find there.
CAMERAS = {
    "right side": (Vector((-1.0, 0.0, 0.0)), "through"),
    "left side": (Vector((1.0, 0.0, 0.0)), "through"),
    "front right, below": (Vector((-0.45, -0.75, -0.5)), "inside"),
    "front left, below": (Vector((0.45, -0.75, -0.5)), "inside"),
}


def main() -> int:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=GLB)
    scene = bpy.context.scene
    manifest = json.loads(scene["character"])
    angle = math.radians(manifest["jaw"]["open_degrees"])
    arm = next(o for o in scene.objects if o.type == "ARMATURE")
    jaw = arm.pose.bones[manifest["jaw"]["bone"]]
    jaw.rotation_mode = "XYZ"
    jaw.rotation_euler = Euler((angle, 0.0, 0.0))
    bpy.context.view_layer.update()

    depsgraph = bpy.context.evaluated_depsgraph_get()
    surfaces = []  # (object name, tree, per-polygon material name)
    for obj in scene.objects:
        if obj.type != "MESH" or not obj.data.materials or not obj.data.materials[0]:
            continue
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        verts = [obj.matrix_world @ v.co for v in mesh.vertices]
        tree = BVHTree.FromPolygons(verts, [p.vertices[:] for p in mesh.polygons])
        mats = [obj.data.materials[p.material_index].name for p in mesh.polygons]
        surfaces.append((obj.name, tree, mats))
        evaluated.to_mesh_clear()
    head_tree = next(t for n, t, _ in surfaces if n == HEAD)

    def seen(origin: Vector, direction: Vector) -> tuple[str, str] | None:
        """First front face along the ray, as (object, material); back faces are skipped."""
        best = None
        for name, tree, mats in surfaces:
            start = origin.copy()
            for _ in range(64):
                hit, normal, index, dist = tree.ray_cast(start, direction, 3.0)
                if hit is None:
                    break
                if normal.dot(direction) < 0:  # front face
                    total = (hit - origin).length
                    if best is None or total < best[0]:
                        best = (total, name, mats[index])
                    break
                start = hit + direction * 1e-5
        return (best[1], best[2]) if best else None

    failures = []
    checked = 0
    for view, (toward_camera, expect) in CAMERAS.items():
        look = -toward_camera.normalized()
        side = 1.0 if toward_camera.x > 0 else -1.0  # the side of the head this camera sees
        for y, z in GAPE:
            gap = (JAW_HINGE_Y - y) * math.sin(angle)
            if gap < MIN_GAP:
                continue
            # the upper lip on this side, found on the posed head surface
            lip = head_tree.ray_cast(Vector((side * 0.5, y, z + 0.002)), Vector((-side, 0.0, 0.0)), 1.0)[0]
            if lip is None:
                continue
            target = Vector((lip.x, y, z - gap / 2))  # middle of the gap
            hit = seen(target - look * 1.0, look)
            checked += 1
            where = f"{view}, y={y:+.2f}"
            if hit is not None and hit[0] != HEAD:
                failures.append(f"{where}: sees {hit[0]} through the mouth")
            elif expect == "through" and hit is not None:
                failures.append(f"{where}: the gap is closed by the {hit[1]} surface of {hit[0]} (should see through)")
            elif expect == "inside" and (hit is None or hit[1] != MOUTH_MATERIAL):
                failures.append(f"{where}: sees {hit[1] + ' on ' + hit[0] if hit else 'empty space'} instead of the mouth's inside")
    for f in failures:
        print("FAIL ", f)
    print(f"{checked} lines of sight, {len(failures)} failing")
    return 1 if failures or not checked else 0


if __name__ == "__main__":
    sys.exit(main())
