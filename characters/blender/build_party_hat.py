"""Build the party hat accessory, fitted to the stock dodi.

    blender --background --python-exit-code 1 --python characters/blender/build_party_hat.py

Imports the exported ``characters/dodi/dodi.glb`` and stands a striped cone
on the front of its hood, in front of the antennae, tipped a little forward
and to one side. The cone's rim is ray cast onto the hood so it sits snugly on
the curved head instead of floating on a flat base. Writes
``characters/accessories/party_hat/party_hat.glb`` (the runtime asset) and
``party_hat.blend`` (with dodi, to inspect the fit). The accessory's origin is
its ``attach`` point, which goes on ``socket_head_top``.
"""

from __future__ import annotations

import json
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import kit  # noqa: E402
from kit import Blob  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
CHARACTER = os.path.join(ROOT, "dodi", "dodi.glb")
NAME = "party_hat"
OUT_DIR = os.path.join(ROOT, "accessories", NAME)
SOCKET = "socket_head_top"

# Cheerful colours that pop against dodi's whites and blues (sRGB); the second
# value is the toon shadow tone.
PALETTE = {
    "cone": ("#f2669a", "#c94f7f"),
    "stripe": ("#ffd35a", "#e2ab3c"),
    "pompom": ("#fff6d8", "#e8d7a6"),
    "trim": ("#fff6d8", "#e8d7a6"),
}

# Where the hat stands, seen from above (x, y): on the hood's crown in front of
# the antennae (their bases are at x = +-0.05, y = -0.1 and they lean back).
SPOT = (0.0, -0.19)
TILT_FORWARD = 14.0  # degrees; the tip leans towards the beak
TILT_SIDE = 12.0  # degrees; the tip leans to the character's right (-x): a jaunty angle
HEIGHT = 0.17  # rim to tip along the hat's axis
RIM_RADIUS = 0.064
RIM_PRESS = 0.002  # the rim sinks this far into the hood so it reads as sitting on it
AROUND = 40  # vertices around the cone
ALONG = 30  # rings from the rim to the tip

# Spiral stripes: STRIPES of each colour around, turning TWIST times rim to tip.
STRIPES = 3
TWIST = 0.55

TRIM_RADIUS = 0.0085  # the fluffy roll around the rim
TRIM_OUT = 0.0035  # how far the roll sits outside the cone wall
POMPOM = 0.028  # radius of the pompom on the tip


def hat_axes() -> tuple[Vector, Vector, Vector]:
    """(axis up the hat, e1, e2): the hat's own frame, tipped forward and sideways."""
    tilt = Matrix.Rotation(math.radians(-TILT_SIDE), 3, "Y") @ Matrix.Rotation(math.radians(TILT_FORWARD), 3, "X")
    axis = (tilt @ Vector((0.0, 0.0, 1.0))).normalized()
    e1 = (tilt @ Vector((1.0, 0.0, 0.0))).normalized()
    e2 = axis.cross(e1).normalized()
    return axis, e1, e2


def rim(skin: kit.Surface, base: Vector, axis: Vector, e1: Vector, e2: Vector) -> list[Vector]:
    """The rim, one point per angle, dropped along the axis onto the head."""
    points = []
    for i in range(AROUND):
        a = 2.0 * math.pi * i / AROUND
        above = base + (e1 * math.cos(a) + e2 * math.sin(a)) * RIM_RADIUS + axis * 0.1
        hit = skin.cast(above, -axis, 0.3)
        if hit is None:
            raise RuntimeError("the hat's rim misses the head")
        points.append(hit[0] - axis * RIM_PRESS)
    return points


def stripe_field(base: Vector, axis: Vector, e1: Vector, e2: Vector):
    """Negative on the stripes: a spiral of STRIPES bands around the cone."""

    def field(co: Vector) -> float:
        d = Vector(co) - base
        t = d.dot(axis) / HEIGHT
        a = math.atan2(d.dot(e2), d.dot(e1))
        return math.sin(STRIPES * a + 2.0 * math.pi * TWIST * t * STRIPES)

    return field


def build_cone(skin: kit.Surface, mats: dict) -> tuple[bpy.types.Object, list[Vector], Vector, Vector]:
    axis, e1, e2 = hat_axes()
    hit = skin.cast(Vector((SPOT[0], SPOT[1], 1.5)), Vector((0.0, 0.0, -1.0)), 2.0)
    if hit is None:
        raise RuntimeError("no head under the hat")
    base = hit[0]
    ring = rim(skin, base, axis, e1, e2)
    mean = sum(ring, Vector()) / len(ring)
    tip = mean + axis * HEIGHT
    bm = bmesh.new()
    rows = []
    for j in range(ALONG):
        t = j / ALONG
        rows.append([bm.verts.new(p.lerp(tip, t)) for p in ring])
    apex = bm.verts.new(tip)
    for j in range(ALONG - 1):
        for i in range(AROUND):
            k = (i + 1) % AROUND
            bm.faces.new((rows[j][i], rows[j][k], rows[j + 1][k], rows[j + 1][i]))
    for i in range(AROUND):
        bm.faces.new((rows[-1][i], rows[-1][(i + 1) % AROUND], apex))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new("cone")
    bm.to_mesh(mesh)
    bm.free()
    cone = kit.link(bpy.data.objects.new("cone", mesh))
    cone.data.materials.append(mats["cone"])
    kit.paint_region(cone, stripe_field(mean, axis, e1, e2), mats["stripe"])
    cone.data.shade_smooth()
    return cone, ring, tip, mean


def main() -> None:
    kit.reset_scene()
    os.makedirs(OUT_DIR, exist_ok=True)
    bpy.ops.import_scene.gltf(filepath=CHARACTER)
    bpy.context.view_layer.update()
    scene = bpy.context.scene
    character = list(scene.objects)
    socket = scene.objects[SOCKET].matrix_world.translation.copy()
    skin = kit.Surface([scene.objects["hood"], scene.objects["head"]])
    mats = {key: kit.toon_material(key, base, shade) for key, (base, shade) in PALETTE.items()}

    cone, ring, tip, mean = build_cone(skin, mats)
    parts = [cone]
    # The roll around the rim: just outside the cone wall, its lower edge pressed into the hood.
    axis = (tip - mean).normalized()
    roll = []
    for p in ring:
        out = p - mean
        out = (out - axis * out.dot(axis)).normalized()
        roll.append(p + out * TRIM_OUT + axis * (TRIM_RADIUS * 0.8))
    roll.append(roll[0])
    roll.append(roll[1])
    parts.append(kit.tube("trim", [tuple(p) for p in roll], TRIM_RADIUS, mats["trim"], sides=12))
    # A fluffy pompom: a few lumps melted together.
    centre = tip + axis * (POMPOM * 0.55)
    lumps = [Blob(tuple(centre), POMPOM * 0.86)]
    for i in range(7):
        a = 2.0 * math.pi * i / 7
        d = Vector((math.cos(a), math.sin(a), 0.55 if i % 2 else -0.35)).normalized()
        lumps.append(Blob(tuple(centre + d * POMPOM * 0.42), POMPOM * 0.5))
    parts.append(kit.blob_mesh("pompom", lumps, mats["pompom"], resolution=0.003, max_tris=900))

    antennae = [o for o in character if o.name.startswith("antenna")]
    gap = min(
        (o.matrix_world @ v.co - (p.matrix_world @ w.co)).length
        for p in parts
        for w in p.data.vertices
        for o in antennae
        for v in o.data.vertices
    )
    print(f"[{NAME}] clears the antennae by {gap * 1000:.1f} mm")

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
