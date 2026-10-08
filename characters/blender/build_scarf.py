"""Build the scarf accessory, fitted to the stock dodi.

    blender --background --python-exit-code 1 --python characters/blender/build_scarf.py

Imports the exported ``characters/dodi/dodi.glb`` and wraps a chunky knitted
scarf around its neck, along the tilted collar where the hood meets the body
(low in front, high at the back, as the 2D art draws the collar), with one
short end hanging down the chest. Every ring of the scarf is ray cast against
the real neck, body and head so it hugs them without cutting in. Knitting is
suggested by ribs running along the scarf and cream stripes across it.
Writes ``characters/accessories/scarf/scarf.glb`` (the runtime asset) and
``scarf.blend`` (with dodi, to inspect the fit). The accessory's origin is its
``attach`` point, which goes on ``socket_neck``.
"""

from __future__ import annotations

import json
import math
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import kit  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
CHARACTER = os.path.join(ROOT, "dodi", "dodi.glb")
NAME = "scarf"
OUT_DIR = os.path.join(ROOT, "accessories", NAME)
SOCKET = "socket_neck"

# A warm red with cream stripes, cosy against dodi's white and blue (sRGB); the
# second value is the toon shadow tone.
PALETTE = {
    "wool": ("#e4573d", "#b8432e"),
    "stripe": ("#fbe6c2", "#dcc29a"),
}

# The loop lies in a plane through the neck, tilted so the front drops: the
# collar line of the art. Measured with ray casts: in this plane the neck is
# hood all the way round, just above the body.
COLLAR_CENTER = Vector((0.0, -0.16, 0.53))
COLLAR_TILT = 15.0  # degrees, front down
LOOP_REACH = 0.3  # the loop is fitted within this distance of the neck's axis
LOOP_SEGMENTS_PER_STRIPE = 9  # rings per stripe period; stripes land exactly on rings

HALF_HEIGHT = 0.037  # half the band's width, along the neck
HALF_THICK = 0.017  # half the band's thickness, away from the neck
PRESS = 0.0025  # the inside of the loop presses into the soft neck a little
SECTION = 24  # vertices around the band's cross-section
RIB_DEPTH = 0.0016  # knitted ribs along the scarf
RIB_PITCH = 0.0095  # distance between ribs across the band

STRIPE_PERIOD = 0.1  # along the scarf: wool, then a cream stripe
STRIPE_WIDTH = 3  # of LOOP_SEGMENTS_PER_STRIPE rings

# The hanging end: leaves the loop at the front, a little to the character's
# left, and falls down the chest.
END_ANGLE = 28.0  # degrees round from the front towards the character's left (+x)
END_LENGTH = 0.15
END_GAP = 0.004  # between the hanging end and the loop / chest beneath it
FRINGE = 5  # tassels at the tip
FRINGE_LENGTH = 0.03
FRINGE_RADIUS = 0.0042
KNOT = (0.042, 0.024, 0.034)  # the bunched-up knot where the end leaves the loop


class PosedSurface:
    """Ray queries against the character in every pose of every clip, seen from the socket.

    The scarf rides on the neck bone while the body below and the head above
    move on their own bones (and the hood is skinned between them), so it is
    fitted against all of those poses at once, each moved into the socket's
    rest frame: whatever the clip, nothing comes closer than the fit allows.
    """

    def __init__(self, names: tuple[str, ...], socket: str, samples: int = 12) -> None:
        scene = bpy.context.scene
        arm = next(o for o in scene.objects if o.type == "ARMATURE")
        anim = arm.animation_data or arm.animation_data_create()
        for track in anim.nla_tracks:
            track.mute = True
        rest = scene.objects[socket].matrix_world.copy()
        self._trees: list[BVHTree] = []
        poses: list[tuple[bpy.types.Action | None, float]] = [(None, 0.0)]
        for action in bpy.data.actions:
            start, end = action.frame_range
            poses += [(action, start + (end - start) * i / samples) for i in range(samples)]
        for action, frame in poses:
            anim.action = action
            if action is not None:
                anim.action_slot = next((s for s in action.slots if s.identifier.startswith("OB")), None)
            else:
                kit.rest_pose(arm)
            scene.frame_set(round(frame))
            bpy.context.view_layer.update()
            to_rest = rest @ scene.objects[socket].matrix_world.inverted()
            depsgraph = bpy.context.evaluated_depsgraph_get()
            for name in names:
                obj = scene.objects[name]
                evaluated = obj.evaluated_get(depsgraph)
                mesh = evaluated.to_mesh()
                world = to_rest @ obj.matrix_world
                verts = [world @ v.co for v in mesh.vertices]
                polys = [list(p.vertices) for p in mesh.polygons]
                evaluated.to_mesh_clear()
                self._trees.append(BVHTree.FromPolygons(verts, polys))
        anim.action = None
        kit.rest_pose(arm)
        scene.frame_set(0)
        bpy.context.view_layer.update()
        print(f"[{NAME}] fitting against {len(poses)} poses")

    def cast(self, origin: Vector, direction: Vector, distance: float) -> tuple[Vector, Vector] | None:
        """The first hit along the ray in any pose, as (point, outward normal), or None."""
        best = None
        d = direction.normalized()
        for tree in self._trees:
            hit, normal, _index, dist = tree.ray_cast(origin, d, distance)
            if hit is not None and (best is None or dist < best[0]):
                best = (dist, hit, normal if normal.dot(d) < 0 else -normal)
        return None if best is None else (best[1], best[2])


def collar_frame() -> tuple[Matrix, Vector]:
    rot = Matrix.Rotation(math.radians(COLLAR_TILT), 3, "X")  # takes the front (-y) down
    normal = (rot @ Vector((0.0, 0.0, 1.0))).normalized()  # up the neck, square to the collar plane
    return rot, normal


def radial(phi: float) -> Vector:
    """In the collar plane, from the neck axis outwards; phi = 0 is the front, +phi towards +x."""
    rot, _ = collar_frame()
    return (rot @ Vector((math.sin(phi), -math.cos(phi), 0.0))).normalized()


def section() -> list[tuple[float, float]]:
    """The band's cross-section (out, along): a soft rounded rectangle with ribs on its faces."""
    points = []
    for k in range(SECTION):
        psi = 2.0 * math.pi * k / SECTION
        c, s = math.cos(psi), math.sin(psi)
        a = HALF_THICK * math.copysign(abs(c) ** 0.7, c)
        b = HALF_HEIGHT * math.copysign(abs(s) ** 0.7, s)
        n = Vector((a / HALF_THICK**2, b / HALF_HEIGHT**2)).normalized()
        rib = RIB_DEPTH * (0.5 + 0.5 * math.cos(2.0 * math.pi * b / RIB_PITCH)) * abs(n.x)
        points.append((a + n.x * rib, b + n.y * rib))
    return points


def sweep(
    name: str,
    centers: list[Vector],
    outs: list[Vector],
    alongs: list[Vector],
    shape: list[tuple[float, float]],
    stripes: list[bool],
    mats: dict,
    *,
    closed: bool,
) -> bpy.types.Object:
    """A tube with ``shape`` swept through ``centers``; ``stripes[i]`` colours the segment after ring i."""
    bm = bmesh.new()
    rings = [
        [bm.verts.new(c + o * a + g * b) for a, b in shape] for c, o, g in zip(centers, outs, alongs)
    ]
    count = len(rings) if closed else len(rings) - 1
    for i in range(count):
        r0, r1 = rings[i], rings[(i + 1) % len(rings)]
        for k in range(len(shape)):
            m = (k + 1) % len(shape)
            face = bm.faces.new((r0[k], r0[m], r1[m], r1[k]))
            face.material_index = 1 if stripes[i] else 0
    if not closed:
        for ring in (rings[0], rings[-1]):
            face = bm.faces.new(ring)
            face.material_index = 0
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = kit.link(bpy.data.objects.new(name, mesh))
    obj.data.materials.append(mats["wool"])
    obj.data.materials.append(mats["stripe"])
    obj.data.shade_smooth()
    return obj


def resample_closed(points: list[Vector], n: int) -> list[Vector]:
    """``n`` points evenly spaced by arc length round a closed polyline."""
    loop = points + [points[0]]
    lengths = [0.0]
    for a, b in zip(loop, loop[1:]):
        lengths.append(lengths[-1] + (b - a).length)
    total = lengths[-1]
    out = []
    j = 0
    for i in range(n):
        s = total * i / n
        while lengths[j + 1] < s:
            j += 1
        t = (s - lengths[j]) / max(lengths[j + 1] - lengths[j], 1e-9)
        out.append(loop[j].lerp(loop[j + 1], t))
    return out


def fit_loop(skin: kit.Surface) -> tuple[list[Vector], list[Vector], list[Vector]]:
    """The loop round the neck: for each direction, the farthest skin across the band's width, plus the band."""
    _, normal = collar_frame()
    raw = []
    for phi in np.linspace(0.0, 2.0 * math.pi, 120, endpoint=False):
        d = radial(phi)
        reach = 0.0
        for h in np.linspace(-HALF_HEIGHT, HALF_HEIGHT, 7):
            # Rays start inside LOOP_REACH, so a head drooping over the front (sleep) is not mistaken for the neck.
            origin = COLLAR_CENTER + normal * h + d * LOOP_REACH
            hit = skin.cast(origin, -d, LOOP_REACH)
            if hit is None:
                raise RuntimeError(f"the scarf misses the neck at {math.degrees(phi):.0f} degrees")
            reach = max(reach, (hit[0] - COLLAR_CENTER - normal * h).dot(d))
        raw.append(reach + HALF_THICK - PRESS)
    # Even out the reach round the loop (circularly), so the scarf stays a smooth band.
    reach = np.array(raw)
    for _ in range(6):
        reach = np.maximum(reach, (np.roll(reach, 1) + 2 * reach + np.roll(reach, -1)) / 4)
        reach = (np.roll(reach, 1) + 2 * reach + np.roll(reach, -1)) / 4
    points = [COLLAR_CENTER + radial(phi) * r for phi, r in zip(np.linspace(0.0, 2.0 * math.pi, 120, endpoint=False), reach)]
    length = sum((b - a).length for a, b in zip(points, points[1:] + points[:1]))
    segments = LOOP_SEGMENTS_PER_STRIPE * max(1, round(length / STRIPE_PERIOD))
    centers = resample_closed(points, segments)
    outs, alongs = [], []
    for i, c in enumerate(centers):
        tangent = (centers[(i + 1) % len(centers)] - centers[i - 1]).normalized()
        out = c - COLLAR_CENTER
        out = (out - normal * out.dot(normal) - tangent * out.dot(tangent)).normalized()
        outs.append(out)
        alongs.append(tangent.cross(out).normalized() if tangent.cross(out).dot(normal) > 0 else -tangent.cross(out).normalized())
    return centers, outs, alongs


def fit_end(skin: kit.Surface, start: Vector) -> tuple[list[Vector], list[Vector], list[Vector]]:
    """The hanging end: from the knot straight down the chest, held just off it."""
    steps = LOOP_SEGMENTS_PER_STRIPE * 2 + 1
    centers, outs = [], []
    for i in range(steps):
        s = END_LENGTH * i / (steps - 1)
        x = start.x + 0.012 * (s / END_LENGTH)  # drifts a little outwards as it falls
        z = start.z - s
        hit = skin.cast(Vector((x, start.y - 0.5, z)), Vector((0.0, 1.0, 0.0)), 1.0)
        if hit is None:
            raise RuntimeError("no chest under the scarf's end")
        point, normal = hit
        normal = (normal + Vector((0.0, -0.6, 0.0))).normalized()  # hangs rather than clinging to the curve
        centers.append(point + normal * (HALF_THICK + END_GAP))
        outs.append(normal)
    # The top of the end lies on the loop, not on the chest.
    lift = (start - centers[0]).dot(outs[0])
    for i in range(steps):
        fade = max(0.0, 1.0 - i / 4)
        centers[i] = centers[i] + outs[i] * max(0.0, lift) * fade
    for _ in range(3):
        centers = [centers[0]] + [(a + b * 2 + c) / 4 for a, b, c in zip(centers, centers[1:], centers[2:])] + [centers[-1]]
    alongs = []
    for i, c in enumerate(centers):
        tangent = (centers[min(i + 1, steps - 1)] - centers[max(i - 1, 0)]).normalized()
        out = (outs[i] - tangent * outs[i].dot(tangent)).normalized()
        outs[i] = out
        across = tangent.cross(out).normalized()
        alongs.append(across if across.x > 0 else -across)
    return centers, outs, alongs


def knot(at: Vector, mats: dict) -> bpy.types.Object:
    """The bunched-up knot: a smooth squashed ball, upright along the neck."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=12, radius=1.0)
    mesh = bpy.data.meshes.new("knot")
    bm.to_mesh(mesh)
    bm.free()
    obj = kit.link(bpy.data.objects.new("knot", mesh))
    turn = Matrix.LocRotScale(at, Vector((0.0, 0.0, 1.0)).rotation_difference(collar_frame()[1]), Vector(KNOT))
    obj.data.transform(turn)
    obj.data.materials.append(mats["wool"])
    obj.data.shade_smooth()
    return obj


def main() -> None:
    kit.reset_scene()
    os.makedirs(OUT_DIR, exist_ok=True)
    bpy.ops.import_scene.gltf(filepath=CHARACTER)
    bpy.context.view_layer.update()
    scene = bpy.context.scene
    socket = scene.objects[SOCKET].matrix_world.translation.copy()
    skin = PosedSurface(("hood", "head", "body", "wing_L", "wing_R"), SOCKET)
    mats = {key: kit.toon_material(key, base, shade) for key, (base, shade) in PALETTE.items()}
    shape = section()

    centers, outs, alongs = fit_loop(skin)
    stripes = [i % LOOP_SEGMENTS_PER_STRIPE < STRIPE_WIDTH for i in range(len(centers))]
    parts = [sweep("loop", centers, outs, alongs, shape, stripes, mats, closed=True)]

    # Where the end leaves the loop: on the outside of the loop's front.
    phi = math.radians(END_ANGLE)
    i = min(range(len(centers)), key=lambda k: (outs[k] - radial(phi)).length)
    knot_at = centers[i] + outs[i] * (HALF_THICK * 1.4)
    end_centers, end_outs, end_alongs = fit_end(skin, knot_at)
    # Wider and flatter than the loop: the end is the scarf lying open.
    flat = [(a * 0.85, b * 1.15) for a, b in shape]
    end_stripes = [(k + 4) % LOOP_SEGMENTS_PER_STRIPE < STRIPE_WIDTH for k in range(len(end_centers))]
    parts.append(sweep("end", end_centers, end_outs, end_alongs, flat, end_stripes, mats, closed=False))
    knot_pos = knot_at + outs[i] * 0.002 + Vector((0.006, 0.0, -0.004))
    parts.append(knot(knot_pos, mats))
    # Tassels along the tip.
    tip, down = end_centers[-1], (end_centers[-1] - end_centers[-2]).normalized()
    for k in range(FRINGE):
        offset = end_alongs[-1] * (HALF_HEIGHT * 1.15 * (k / (FRINGE - 1) * 2 - 1) * 0.8)
        top = tip + offset - down * 0.002
        sway = end_alongs[-1] * (0.002 * (k - FRINGE // 2))
        bottom = top + down * FRINGE_LENGTH + sway
        parts.append(kit.tube(f"tassel_{k}", [tuple(top), tuple(top.lerp(bottom, 0.5)), tuple(bottom)], FRINGE_RADIUS, mats["stripe"], sides=6))

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
