"""Face pictures must not pick up colour from neighbouring atlas cells.

    blender --background --python-exit-code 1 --python characters/tests/atlas_bleed.py

A texture is filtered across a picture's border: bilinearly, and much more at
the coarse mipmap levels used when the picture is seen at a grazing angle or
from far away. With REPEAT wrapping, the top row also samples the bottom row.
So every atlas cell a face picture shows needs a transparent band around it,
across wrapped edges too, and a painted stroke must sample solid ink even at
coarse mip levels.

Regression: the solid ink cell sat under the closed-eye cell. Wrapped into the
closed eye's top edge, it drew thin dark lines across the head in the sleep
pose (reported as "strange strokes, only in this state").
"""

from __future__ import annotations

import os
import sys
from collections import defaultdict

import bpy
import numpy as np

GLB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "dodi", "dodi.glb")
BAND = 12  # px of neighbourhood the filtering can reach (about mip level 3-4 of a 256 px cell)
CLEAR = 0.02  # max alpha allowed in a picture's band


def pieces(mesh: bpy.types.Mesh) -> list[list[bpy.types.MeshPolygon]]:
    """Connected pieces of a mesh: one per face picture or stroke."""
    parent = list(range(len(mesh.vertices)))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for poly in mesh.polygons:
        first = find(poly.vertices[0])
        for v in poly.vertices[1:]:
            parent[find(v)] = first
    groups: dict[int, list] = defaultdict(list)
    for poly in mesh.polygons:
        groups[find(poly.vertices[0])].append(poly)
    return list(groups.values())


def main() -> int:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=GLB)
    face = next(o for o in bpy.context.scene.objects if o.type == "MESH" and o.data.shape_keys)
    node = next(n for n in face.data.materials[0].node_tree.nodes if n.type == "TEX_IMAGE")
    image = node.image
    w, h = image.size
    alpha = np.array(image.pixels[:], dtype=np.float32).reshape(h, w, 4)[..., 3]  # row 0 = bottom, like UV v
    wrap = node.extension  # REPEAT, EXTEND (clamp) or MIRROR
    uv = face.data.uv_layers[0].data

    def band_alpha(u0: int, u1: int, v0: int, v1: int) -> float:
        """Max alpha in the ring of BAND px around the pixel rect [u0, u1) x [v0, v1)."""
        cols = np.arange(u0 - BAND, u1 + BAND)
        rows = np.arange(v0 - BAND, v1 + BAND)
        if wrap == "REPEAT":
            cols, rows = cols % w, rows % h
        else:
            cols, rows = np.clip(cols, 0, w - 1), np.clip(rows, 0, h - 1)
        window = alpha[np.ix_(rows, cols)]
        inner = np.zeros(window.shape, dtype=bool)
        inner[BAND : BAND + (v1 - v0), BAND : BAND + (u1 - u0)] = True
        if wrap != "REPEAT":
            # clamped samples beyond the edge repeat the picture's own border pixels
            inner |= np.isin(rows, np.arange(v0, v1))[:, None] & np.isin(cols, np.arange(u0, u1))[None, :]
        return float(window[~inner].max(initial=0.0))

    failures = []
    checked = 0
    for piece in pieces(face.data):
        us = [uv[i].uv.x for p in piece for i in p.loop_indices]
        vs = [uv[i].uv.y for p in piece for i in p.loop_indices]
        u0, u1 = int(round(min(us) * w)), int(round(max(us) * w))
        v0, v1 = int(round(min(vs) * h)), int(round(max(vs) * h))
        where = f"cell at px ({u0}..{u1}, {v0}..{v1})"
        checked += 1
        if u1 - u0 < 2 and v1 - v0 < 2:
            # a painted stroke samples one point: its neighbourhood must be solid ink
            cols = np.clip(np.arange(u0 - BAND, u0 + BAND + 1), 0, w - 1)
            rows = np.clip(np.arange(v0 - BAND, v0 + BAND + 1), 0, h - 1)
            if alpha[np.ix_(rows, cols)].min() < 0.98:
                failures.append(f"stroke sampling {where}: ink is not solid within {BAND} px")
            continue
        leak = band_alpha(u0, u1, v0, v1)
        if leak > CLEAR:
            failures.append(f"picture showing {where}: neighbouring content bleeds in (alpha {leak:.2f}, wrap {wrap})")
    for f in failures:
        print("FAIL ", f)
    print(f"{checked} pictures and strokes checked, {len(failures)} failing")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
