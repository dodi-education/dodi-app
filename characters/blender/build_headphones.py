"""Build the headphones accessory, fitted to the stock dodi.

    blender --background --python-exit-code 1 --python characters/blender/build_headphones.py

Imports the exported ``characters/dodi/dodi.glb`` and fits the ear cups and
the band to its actual head with ray casts, so the headphones sit on the hood
the way they do in the 2D "deaf" art. Writes
``characters/accessories/headphones/headphones.glb`` (the runtime asset),
``headphones.blend`` (with dodi, to inspect the fit) and ``note.png``.
The accessory's origin is its ``attach`` point, which goes on ``socket_ears``.
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

import face_atlas as fa  # noqa: E402
import kit  # noqa: E402
from kit import AtlasCell, Blob  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
CHARACTER = os.path.join(ROOT, "dodi", "dodi.glb")
OUT_DIR = os.path.join(ROOT, "accessories", "headphones")
SOCKET = "socket_ears"

# Colours from the deaf artwork (sRGB); the second value is the toon shadow tone.
PALETTE = {
    "band": ("#2f6378", "#244d5e"),
    "pad": ("#9fc3d6", "#7fa6bb"),
    "shell": ("#3a6a93", "#2d5475"),
    "cap": ("#6aa2cc", "#5286b0"),
    "cushion": ("#b9d6e8", "#93b7cf"),
}

# Where the ear cups sit, in side view (y, z): on the hood right behind the
# face, a little under eye level, as in the art.
EAR = (-0.095, 0.715)
CUP_RADIUS = 0.064
# Stack of each cup outwards from the skin: (centre, half thickness, radius).
CUSHION = (0.006, 0.009, 0.056)  # presses 3 mm into the hood so it reads as touching
SHELL = (0.026, 0.016, CUP_RADIUS)
CAP = (0.040, 0.008, 0.05)

# The band goes over the middle of the head, tilted a little forward so it
# passes in front of the antennae (which lean back). Tilted back, it looked
# like it would slip off.
BAND_TILT = -14.0  # degrees from vertical; negative leans forward
BAND_RADIUS = 0.015
BAND_CLEARANCE = 0.012  # gap between the skin and the band, as in the art
PAD_RADIUS = 0.009  # the lighter padding strip on the band's inside

NOTE_SIZE = 0.068  # decal size on each cup
NOTE_CELL = AtlasCell(0, 0, 256, 256)


def note_image() -> bpy.types.Image:
    """A white eighth note, drawn like the face pictures."""
    white = "#ffffff"
    k = NOTE_SIZE / 0.06  # the note was drawn on a 0.06 decal
    paints = [
        fa.Paint(fa.disk(-0.0075 * k, -0.011 * k, 0.0075 * k), white),
        fa.Paint(fa.stroke([(-0.0005 * k, -0.011 * k), (-0.0005 * k, 0.016 * k)], 0.0032 * k), white),
        fa.Paint(
            fa.stroke(fa.bezier((-0.0005 * k, 0.016 * k), (0.011 * k, 0.012 * k), (0.009 * k, 0.001 * k)), 0.0032 * k),
            white,
        ),
    ]
    rgba = fa.render_cell(paints, (NOTE_SIZE, NOTE_SIZE), (NOTE_CELL.w, NOTE_CELL.h))
    image = bpy.data.images.new("note", NOTE_CELL.w, NOTE_CELL.h, alpha=True)
    image.alpha_mode = "STRAIGHT"
    image.pixels.foreach_set(rgba[::-1].ravel())
    image.filepath_raw = os.path.join(OUT_DIR, "note.png")
    image.file_format = "PNG"
    image.save()
    image.pack()
    return image


def aligned(axis: Vector) -> tuple[float, float, float]:
    """Euler degrees turning a blob's thin x axis onto ``axis``."""
    return tuple(math.degrees(a) for a in Vector((1.0, 0.0, 0.0)).rotation_difference(axis).to_euler("XYZ"))


def build_cup(side: str, sign: float, skin: kit.Surface, mats: dict, note: bpy.types.Material) -> tuple[list, Vector]:
    """One ear cup: cushion, shell and cap stacked outwards from the hood, plus the note."""
    hit = skin.cast(Vector((sign * 0.5, EAR[0], EAR[1])), Vector((-sign, 0.0, 0.0)), 1.0)
    if hit is None:
        raise RuntimeError(f"no head surface at the {side} ear")
    point, normal = hit
    axis = (normal + Vector((sign, 0.0, 0.0))).normalized()  # mostly sideways, following the hood a little
    rot = aligned(axis)
    parts = []
    for name, (offset, half, radius), material in (
        ("cushion", CUSHION, mats["cushion"]),
        ("shell", SHELL, mats["shell"]),
        ("cap", CAP, mats["cap"]),
    ):
        blob = Blob(at=tuple(point + axis * offset), radii=(half, radius, radius), rot=rot)
        parts.append(kit.blob_mesh(f"{name}_{side}", [blob], material, resolution=0.003, max_tris=450))
    cap = parts[-1]
    face_center = point + axis * (CAP[0] + CAP[1])
    patch = kit.decal_patch(
        cap, tuple(face_center), tuple(axis), (NOTE_SIZE, NOTE_SIZE), NOTE_CELL, (NOTE_CELL.w, NOTE_CELL.h),
        forward=(0.0, sign, 0.0),  # +u to the viewer's right on both cups, so the note reads the same
        reach=0.02,
    )
    parts.append(kit.decal_mesh(f"note_{side}", patch, note))
    shell_top = point + axis * SHELL[0] + Vector((0.0, 0.0, CUP_RADIUS * 0.7))
    return parts, shell_top


def band_path(skin: kit.Surface, ends: tuple[Vector, Vector]) -> list[Vector]:
    """Points over the crown, following the skin at a fixed clearance, from one cup to the other."""
    left, right = ends
    middle = (left + right) / 2.0
    tilt = math.radians(BAND_TILT)
    across = Vector((1.0, 0.0, 0.0))
    up = Vector((0.0, math.sin(tilt), math.cos(tilt)))  # +y is behind the character, so a negative tilt leans forward
    points = []
    for t in np.linspace(math.radians(24), math.radians(156), 33):
        d = (across * math.cos(t) + up * math.sin(t)).normalized()
        hit = skin.cast(middle + d * 0.5, -d, 1.0)
        if hit is None:
            continue
        surface, normal = hit
        points.append(surface + normal * (BAND_CLEARANCE + BAND_RADIUS))
    for _ in range(4):  # even out the skin's small bumps
        points = [points[0]] + [(a + b * 2 + c) / 4 for a, b, c in zip(points, points[1:], points[2:])] + [points[-1]]
    return [left] + points + [right]


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
    note = kit.decal_material("note", note_image())

    parts, tops = [], []
    for side, sign in (("L", 1.0), ("R", -1.0)):
        cup, top = build_cup(side, sign, skin, mats, note)
        parts += cup
        tops.append(top)
    path = band_path(skin, (tops[0], tops[1]))
    parts.append(kit.tube("band", [tuple(p) for p in path], BAND_RADIUS, mats["band"]))
    # The padding: a thinner, lighter strip on the band's inside, over the crown only.
    inner = [p + (socket - p).normalized() * (BAND_RADIUS * 0.7) for p in path[6:-6]]
    parts.append(kit.tube("pad", [tuple(p) for p in inner], PAD_RADIUS, mats["pad"]))

    antennae = [o for o in character if o.name.startswith("antenna")]
    gap = min((p - (o.matrix_world @ v.co)).length for p in path for o in antennae for v in o.data.vertices)
    print(f"[headphones] band clears the antennae by {(gap - BAND_RADIUS) * 1000:.1f} mm")

    # The accessory's origin is its attach point: move everything so socket_ears sits at 0.
    root = kit.link(bpy.data.objects.new("headphones", None))
    attach = kit.link(bpy.data.objects.new("attach", None))
    attach.empty_display_type = "ARROWS"
    attach.empty_display_size = 0.04
    attach.parent = root
    shift = Matrix.Translation(-socket)
    for part in parts:
        part.data.transform(shift)
        part.parent = root
    root.location = socket  # shown in place on dodi in the .blend; the export resets it below
    if "character" in scene:
        del scene["character"]  # the imported dodi's manifest; this file is an accessory
    scene["accessory"] = json.dumps(
        {"format": "accessory", "version": 1, "name": "headphones", "socket": SOCKET, "fitted_to": "dodi"}
    )
    tris = sum(kit.triangle_count(p) for p in parts)
    print(f"[headphones] {len(parts)} meshes, {tris} triangles")

    root.location = (0.0, 0.0, 0.0)
    bpy.context.view_layer.update()
    kit.export_accessory(os.path.join(OUT_DIR, "headphones.glb"), root)
    kit.publish_to_web(os.path.join(OUT_DIR, "headphones.glb"), "accessories/headphones.glb")
    root.location = socket
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT_DIR, "headphones.blend"))
    print(f"[headphones] wrote {OUT_DIR}")


if __name__ == "__main__":
    main()
