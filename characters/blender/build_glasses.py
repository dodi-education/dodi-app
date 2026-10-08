"""Build the glasses accessory, fitted to the stock dodi.

    blender --background --python-exit-code 1 --python characters/blender/build_glasses.py

Imports the exported ``characters/dodi/dodi.glb`` and fits round frames to
its face with ray casts: one flat rim in front of each eye (dodi's eyes sit
on the sides of the head, so each rim faces along its own eye), a bridge that
arches over the snout just behind the beak, and temples that run back along
the head and rest on the hood. Frames only, no lenses, so the eyes and every
expression stay fully visible. Writes ``characters/accessories/glasses/glasses.glb``
(the runtime asset) and ``glasses.blend`` (with dodi, to inspect the fit).
The accessory's origin is its ``attach`` point, which goes on ``socket_eyes``.
"""

from __future__ import annotations

import json
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import kit  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
CHARACTER = os.path.join(ROOT, "dodi", "dodi.glb")
NAME = "glasses"
OUT_DIR = os.path.join(ROOT, "accessories", NAME)
SOCKET = "socket_eyes"

# Bright red frames that pop against dodi's blue face (sRGB); the second value
# is the toon shadow tone.
PALETTE = {"frame": ("#e5484d", "#b5363b")}

# The eyes, as in build_dodi.py: on the head sphere, 42 degrees forward of the
# side and 22 degrees up.
HEAD_CENTER = Vector((0.0, -0.18, 0.72))
EYE_AZIMUTH, EYE_ELEVATION = 42.0, 22.0
FACE_FORWARD = 0.25  # turns each rim a little from its eye's normal towards the front

RIM_RADIUS = 0.056  # to the middle of the frame tube; the eye picture fits inside
TUBE = 0.0068  # frame thickness (radius)
CLEARANCE = 0.0035  # gap between the frame and the face, beak or decal
TEMPLE_END_Y = -0.165  # the temples rest on the hood here, in front of the headphone cups
TEMPLE_PRESS = 0.0015  # how far the temple tips press into the hood


def eye_normal(sign: float) -> Vector:
    az, el = math.radians(EYE_AZIMUTH), math.radians(EYE_ELEVATION)
    return Vector((sign * math.cos(az) * math.cos(el), -math.sin(az) * math.cos(el), math.sin(el)))


def rim_frame(sign: float) -> tuple[Vector, Vector, Vector]:
    """(axis out of the rim, u towards the back of the head, v up)."""
    axis = (eye_normal(sign) + Vector((0.0, -FACE_FORWARD, 0.0))).normalized()
    up = Vector((0.0, 0.0, 1.0))
    v = (up - axis * axis.dot(up)).normalized()
    u = v.cross(axis) * sign  # +u points backwards (+y) on both sides
    if u.y < 0:
        u = -u
    return axis, u, v


def fit_rim(skin: kit.Surface, sign: float) -> tuple[list[Vector], Vector, Vector, Vector, Vector]:
    """One flat round rim, pushed out along its axis until the whole frame clears the face."""
    axis, u, v = rim_frame(sign)
    hit = skin.cast(HEAD_CENTER + eye_normal(sign) * 0.5, -eye_normal(sign), 1.0)
    if hit is None:
        raise RuntimeError("no face under the eye")
    center = hit[0]
    height = -1.0
    for phi in np.linspace(0.0, 2.0 * math.pi, 96, endpoint=False):
        for r in (RIM_RADIUS - TUBE, RIM_RADIUS, RIM_RADIUS + TUBE):
            q = center + (u * math.cos(phi) + v * math.sin(phi)) * r
            ground = skin.cast(q + axis * 0.2, -axis, 0.4)
            if ground is not None:
                height = max(height, (ground[0] - center).dot(axis))
    lift = height + TUBE + CLEARANCE
    middle = center + axis * lift
    points = [middle + (u * math.cos(phi) + v * math.sin(phi)) * RIM_RADIUS
              for phi in np.linspace(0.0, 2.0 * math.pi, 64, endpoint=False)]
    print(f"[{NAME}] rim {'L' if sign > 0 else 'R'} sits {lift * 1000:.1f} mm in front of the eye")
    return points, middle, axis, u, v


def ring_tube(name: str, points: list[Vector], radius: float, material: bpy.types.Material) -> bpy.types.Object:
    """A closed round tube through ``points`` (kit.tube is open-ended)."""
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.bevel_mode = "ROUND"
    curve.bevel_depth = radius
    curve.bevel_resolution = 2
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for p, co in zip(spline.points, points):
        p.co = (*co, 1.0)
    spline.use_cyclic_u = True
    holder = kit.link(bpy.data.objects.new(f"{name}_curve", curve))
    depsgraph = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(holder.evaluated_get(depsgraph))
    bpy.data.objects.remove(holder)
    bpy.data.curves.remove(curve)
    mesh.name = name
    obj = kit.link(bpy.data.objects.new(name, mesh))
    obj.data.shade_smooth()
    obj.data.materials.append(material)
    return obj


def smooth(points: list[Vector], passes: int) -> list[Vector]:
    for _ in range(passes):
        points = [points[0]] + [(a + b * 2 + c) / 4 for a, b, c in zip(points, points[1:], points[2:])] + [points[-1]]
    return points


def bridge(skin: kit.Surface, left: Vector, right: Vector) -> list[Vector]:
    """From rim to rim over the snout, held CLEARANCE off the skin, arching a little."""
    look = Vector((0.0, -0.55, 0.85)).normalized()  # the bridge is pushed out along this, off the snout
    points = []
    for s in np.linspace(0.0, 1.0, 17):
        p = left.lerp(right, s) + look * (0.006 * math.sin(math.pi * s))
        ground = skin.cast(p + look * 0.2, -look, 0.4)
        if ground is not None:
            need = (ground[0] - p).dot(look) + (TUBE + CLEARANCE) / max(ground[1].dot(look), 0.3)
            if need > 0:
                p = p + look * need
        points.append(p)
    return smooth(points, 3)


def temple(skin: kit.Surface, start: Vector, sign: float, lift: float) -> list[Vector]:
    """From the rim's back edge along the side of the head to the hood, coming to rest on it."""
    end = Vector((sign * 0.2, TEMPLE_END_Y, start.z + 0.004))
    points = [start]
    count = 12
    for i in range(1, count + 1):
        t = i / count
        guess = start.lerp(end, t)
        inward = Vector((-sign, 0.0, 0.0))
        ground = skin.cast(Vector((sign * 0.5, guess.y, guess.z)), inward, 1.0)
        if ground is None:
            raise RuntimeError("the temple misses the head")
        gap = (1.0 - t) * lift + t * (TUBE - TEMPLE_PRESS)
        points.append(ground[0] + ground[1] * gap)
    # Ease out of the rim: keep the first few points from cutting towards the skin.
    return smooth(points, 3)


def main() -> None:
    kit.reset_scene()
    os.makedirs(OUT_DIR, exist_ok=True)
    bpy.ops.import_scene.gltf(filepath=CHARACTER)
    bpy.context.view_layer.update()
    scene = bpy.context.scene
    socket = scene.objects[SOCKET].matrix_world.translation.copy()
    skin = kit.Surface([scene.objects["head"], scene.objects["hood"]])
    mat = kit.toon_material("frame", *PALETTE["frame"])

    parts = []
    rims = {}
    for side, sign in (("L", 1.0), ("R", -1.0)):
        points, middle, axis, u, v = fit_rim(skin, sign)
        rim = ring_tube(f"rim_{side}", points, TUBE, mat)
        rim["clearance"] = CLEARANCE * 0.5  # accessory_fit.py: the rims never touch the face
        parts.append(rim)
        rims[side] = (middle, axis, u, v)
    # The bridge leaves each rim at its upper inner edge, like real glasses.
    ends = []
    for side in ("L", "R"):
        middle, axis, u, v = rims[side]
        a = math.radians(155.0)  # from +u (backwards) round to the front, a little above the middle
        ends.append(middle + (u * math.cos(a) + v * math.sin(a)) * RIM_RADIUS)
    nose = kit.tube("bridge", [tuple(p) for p in bridge(skin, ends[0], ends[1])], TUBE, mat)
    nose["clearance"] = CLEARANCE * 0.5
    parts.append(nose)
    for side, sign in (("L", 1.0), ("R", -1.0)):
        middle, axis, u, v = rims[side]
        start = middle + (u * math.cos(0.15) + v * math.sin(0.15)) * RIM_RADIUS
        ground = skin.cast(start + axis * 0.2, -axis, 0.4)
        gap = (start - ground[0]).dot(axis) if ground else TUBE + CLEARANCE
        parts.append(kit.tube(f"temple_{side}", [tuple(p) for p in temple(skin, start, sign, gap)], TUBE * 0.85, mat))

    root = kit.link(bpy.data.objects.new(NAME, None))
    attach = kit.link(bpy.data.objects.new("attach", None))
    attach.empty_display_type = "ARROWS"
    attach.empty_display_size = 0.04
    attach.parent = root
    shift = Matrix.Translation(-socket)
    for part in parts:
        part.data.transform(shift)
        part.parent = root
    root.location = socket
    if "character" in scene:
        del scene["character"]
    scene["accessory"] = json.dumps(
        {"format": "accessory", "version": 1, "name": NAME, "socket": SOCKET, "fitted_to": "dodi"}
    )
    tris = sum(kit.triangle_count(p) for p in parts)
    print(f"[{NAME}] {len(parts)} meshes, {tris} triangles")

    root.location = (0.0, 0.0, 0.0)
    bpy.context.view_layer.update()
    out = os.path.join(OUT_DIR, f"{NAME}.glb")
    kit.export_accessory(out, root)
    kit.publish_to_web(out, f"accessories/{NAME}.glb")
    root.location = socket
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT_DIR, f"{NAME}.blend"))
    print(f"[{NAME}] wrote {OUT_DIR}")


if __name__ == "__main__":
    main()
