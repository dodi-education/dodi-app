"""Blended facial expressions must stay visible.

    blender --background --python-exit-code 1 --python characters/tests/face_morphs.py

Imports the exported dodi.glb (the file viewers load) and sets morph weights
the way three.js does when two clips play at once or cross-fade, e.g. 50%
sleep + 50% happy. At every blend, each side of the head must show at least
one eye picture and the mouth, and no picture that shows may be cut by the
skin.

A shown mouth stroke must also hug the skin: where the gape runs along the
head's outline (the sleep pose seen from the front), a stroke floating off the
skin pokes past the outline as a thin line.

Regressions: hidden states used to shrink to a speck under the skin, so at a
50/50 blend both the outgoing and the incoming eyes sat below the surface and
the eyes vanished (reported as "switching to happy removes the eyes"); and the
mouth stroke floated 1.4 mm off the skin, drawing a line along the cheeks'
outline in the sleep pose (reported as "strange strokes").
"""

from __future__ import annotations

import os
import sys
from collections import defaultdict

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

GLB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "dodi", "dodi.glb")
ATLAS_GRID = (4, 2)  # face atlas cells: 4 columns, 2 rows
INK_CELL = (1, 0)  # the mouth stroke's solid ink (Blender flips v, so the atlas's bottom row is 0)
SHOWN = 0.25  # smaller than a quarter of its full size, a picture counts as hidden
MIN_LIFT = 0.0003  # a shown eye picture must sit at least this far above the skin everywhere
MIN_STROKE_LIFT = 0.0001  # thin strokes may sit closer to the skin than pictures
MAX_STROKE_LIFT = 0.0008  # ...and must not float further off it than this

CASES: dict[str, dict[str, float]] = {
    "rest": {},
    "happy": {"eyes_happy": 1.0},
    "idle to happy, halfway": {"eyes_happy": 0.5},
    "sleep and happy, 50/50": {"eyes_closed": 0.5, "eyes_happy": 0.5},
    "think and sleep, 50/50": {"eyes_up": 0.5, "eyes_closed": 0.5, "mouth_neutral": 1.0},
    "hungry, halfway": {"eyes_sad": 0.5, "mouth_frown": 0.5},
    "sleep": {"eyes_closed": 1.0, "mouth_neutral": 1.0},
}


def main() -> int:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=GLB)
    scene = bpy.context.scene
    face = next(o for o in scene.objects if o.type == "MESH" and o.data.shape_keys)
    head = scene.objects["head"]
    keys = face.data.shape_keys.key_blocks
    uv = face.data.uv_layers[0].data

    # A picture is one connected piece of the face mesh (an eye state or a
    # mouth stroke on one side); its atlas cell says whether it is eyes or mouth.
    parent = list(range(len(face.data.vertices)))

    def root(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    cell_of: dict[int, tuple[int, int]] = {}
    for poly in face.data.polygons:
        u = sum(uv[i].uv.x for i in poly.loop_indices) / poly.loop_total
        v = sum(uv[i].uv.y for i in poly.loop_indices) / poly.loop_total
        cell = (min(int(u * ATLAS_GRID[0]), ATLAS_GRID[0] - 1), min(int(v * ATLAS_GRID[1]), ATLAS_GRID[1] - 1))
        first = poly.vertices[0]
        for vi in poly.vertices:
            cell_of[vi] = cell
            parent[root(vi)] = root(first)
    islands: dict[int, list[int]] = defaultdict(list)
    for vi in range(len(parent)):
        islands[root(vi)].append(vi)

    # Measure against the skin only: the mouth's inner caps (material "mouth")
    # meet the skin at the lips, and their normals point into the mouth.
    depsgraph = bpy.context.evaluated_depsgraph_get()
    skin_mesh = head.evaluated_get(depsgraph).to_mesh()
    skin = [p.vertices[:] for p in skin_mesh.polygons if head.data.materials[p.material_index].name != "mouth"]
    tree = BVHTree.FromPolygons([v.co.copy() for v in skin_mesh.vertices], skin)
    head.evaluated_get(depsgraph).to_mesh_clear()
    head_inv = head.matrix_world.inverted()

    def evaluate(weights: dict[str, float]) -> list[Vector]:
        for block in keys[1:]:
            block.value = weights.get(block.name, 0.0)
        bpy.context.view_layer.update()
        mesh = face.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh()
        world = [face.matrix_world @ v.co for v in mesh.vertices]
        face.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh_clear()
        return world

    def pictures(world: list[Vector]) -> dict[tuple, list[int]]:
        """Pictures keyed by (island, atlas cell, on the left side)."""
        return {
            (key, cell_of.get(ids[0]), sum(world[i].x for i in ids) > 0): ids for key, ids in islands.items()
        }

    def size(ids: list[int], world: list[Vector]) -> float:
        xs = [world[i] for i in ids]
        return max((max(p[a] for p in xs) - min(p[a] for p in xs)) for a in range(3))

    # Full size of every picture = its largest extent over the single-state poses.
    full: dict[tuple, float] = defaultdict(float)
    for state in [{}] + [{block.name: 1.0} for block in keys[1:]]:
        world = evaluate(state)
        for key, ids in pictures(world).items():
            full[key] = max(full[key], size(ids, world))

    failures = 0
    for name, weights in CASES.items():
        world = evaluate(weights)
        problems = []
        seen: dict[tuple[bool, str], int] = defaultdict(int)
        for key, ids in pictures(world).items():
            _island, cell, right = key
            lifts = []
            for i in ids:
                local = head_inv @ world[i]
                hit, normal, _index, _dist = tree.find_nearest(local)
                lifts.append((local - hit).dot(normal))
            part = "mouth" if cell == INK_CELL else "eyes"
            low = MIN_STROKE_LIFT if part == "mouth" else MIN_LIFT
            if size(ids, world) < SHOWN * full[key] or max(lifts) < low:
                continue  # hidden: a speck, or entirely under the skin
            seen[(right, part)] += 1
            side = "left" if right else "right"
            if min(lifts) < low:
                problems.append(f"{part} picture (atlas cell {cell}) on the {side} is cut by the skin ({min(lifts) * 1000:+.2f} mm)")
            if part == "mouth" and max(lifts) > MAX_STROKE_LIFT:
                problems.append(f"mouth stroke on the {side} floats {max(lifts) * 1000:.2f} mm off the skin (max {MAX_STROKE_LIFT * 1000:.1f})")
        for right in (False, True):
            for part in ("eyes", "mouth"):
                if not seen[(right, part)]:
                    problems.append(f"no {part} visible on the {'left' if right else 'right'}")
        failures += bool(problems)
        print(f"{'FAIL' if problems else 'PASS'}  {name}" + "".join(f"\n        - {p}" for p in problems))
    print(f"{failures} failing case(s)")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
