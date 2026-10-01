"""Signed distance fields and a surface-nets mesher, numpy only.

Metaballs are always blobby: they cannot end in a point, and where they meet
they leave lumps and dents. Distance fields give exact primitives, smooth
unions with a chosen fillet radius, flush blends such as the snout running
into the beak, and side-view outlines puffed out into rounded shapes that
end in a real point (the beak's hook).

A field takes an (N, 3) array of points and returns (N,) signed distances,
negative inside.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence

import numpy as np

Field = Callable[[np.ndarray], np.ndarray]
Vec3 = Sequence[float]


def ellipsoid(center: Vec3, radii: Vec3) -> Field:
    """Axis-aligned ellipsoid (a close bound, exact on the surface)."""
    c, r = np.asarray(center, float), np.asarray(radii, float)

    def f(p: np.ndarray) -> np.ndarray:
        q = p - c
        k0 = np.linalg.norm(q / r, axis=-1)
        k1 = np.linalg.norm(q / (r * r), axis=-1)
        return k0 * (k0 - 1.0) / np.maximum(k1, 1e-12)

    return f


def closed_spline(points: Sequence[tuple[float, float]], samples: int = 10) -> np.ndarray:
    """A closed Catmull-Rom curve through 2D ``points``, as a dense polygon."""
    p = np.asarray(points, float)
    out = []
    for i in range(len(p)):
        p0, p1, p2, p3 = p[i - 1], p[i], p[(i + 1) % len(p)], p[(i + 2) % len(p)]
        for t in np.linspace(0.0, 1.0, samples, endpoint=False):
            out.append(
                0.5
                * (
                    2 * p1
                    + (p2 - p0) * t
                    + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
                    + (3 * p1 - p0 - 3 * p2 + p3) * t * t * t
                )
            )
    return np.array(out)


def outline(polygon: np.ndarray, box: tuple[tuple[float, float], tuple[float, float]]) -> Callable[[np.ndarray], np.ndarray]:
    """Signed distance to a closed 2D polygon (negative inside) for (N, 2) points.

    Only points inside ``box`` are measured; everywhere else gets a large
    value, so the box must leave a wide margin around the polygon.
    """
    a_pts = np.asarray(polygon, float)
    b_pts = np.roll(a_pts, -1, axis=0)
    (lo_u, lo_v), (hi_u, hi_v) = box

    def f(q: np.ndarray) -> np.ndarray:
        out = np.full(len(q), 1.0)
        near = (q[:, 0] > lo_u) & (q[:, 0] < hi_u) & (q[:, 1] > lo_v) & (q[:, 1] < hi_v)
        qq = q[near]
        d2 = np.full(len(qq), np.inf)
        inside = np.zeros(len(qq), dtype=bool)
        for a, b in zip(a_pts, b_pts):
            e, w = b - a, qq - a
            t = np.clip((w @ e) / (e @ e), 0.0, 1.0)
            diff = w - np.outer(t, e)
            d2 = np.minimum(d2, np.einsum("ij,ij->i", diff, diff))
            crosses = (a[1] <= qq[:, 1]) != (b[1] <= qq[:, 1])
            at = a[0] + (qq[:, 1] - a[1]) * (b[0] - a[0]) / np.where(b[1] != a[1], b[1] - a[1], 1.0)
            inside ^= crosses & (qq[:, 0] < at)
        out[near] = np.where(inside, -np.sqrt(d2), np.sqrt(d2))
        return out

    return f


def inflate(profile: Callable[[np.ndarray], np.ndarray], width: Field, roundness: float) -> Field:
    """A side-view outline puffed out sideways (along x) with rounded edges.

    ``profile`` is a 2D distance over (y, z), negative inside the outline.
    Deeper than ``roundness`` inside it the sides are flat at half-width
    ``width(p)``; closer to the outline the cross-section is a quarter ellipse,
    so every edge is round and thin parts (a hook) taper to a point. Using an
    ellipse distance keeps the field well behaved right up to the outline,
    which the mesher needs to produce a clean surface there.
    """

    def f(p: np.ndarray) -> np.ndarray:
        u = -profile(p[:, 1:3])  # depth inside the outline
        v = np.abs(p[:, 0])
        w = width(p)
        qu = np.minimum(u - roundness, 0.0)
        k0 = np.hypot(qu / roundness, v / w)
        k1 = np.hypot(qu / (roundness * roundness), v / (w * w))
        return np.where(qu == 0.0, v - w, k0 * (k0 - 1.0) / np.maximum(k1, 1e-12))

    return f


def smoothstep(a: float, b: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def union(*fields: Field) -> Field:
    return lambda p: np.min([f(p) for f in fields], axis=0)


def smooth_union(k: float, *fields: Field) -> Field:
    """Union whose joins are filleted over roughly ``k``."""

    def f(p: np.ndarray) -> np.ndarray:
        d = fields[0](p)
        for g in fields[1:]:
            e = g(p)
            h = np.maximum(k - np.abs(d - e), 0.0) / k
            d = np.minimum(d, e) - h * h * k * 0.25
        return d

    return f


def gradient(f: Field, p: np.ndarray, eps: float = 1e-4) -> np.ndarray:
    g = np.empty_like(p)
    for i in range(3):
        e = np.zeros(3)
        e[i] = eps
        g[:, i] = (f(p + e) - f(p - e)) / (2 * eps)
    return g


def surface_nets(f: Field, lo: Vec3, hi: Vec3, step: float) -> tuple[np.ndarray, np.ndarray]:
    """Mesh the zero level of ``f`` inside the box ``lo``..``hi``.

    One vertex per grid cell the surface passes through (the mean of the
    cell's edge crossings), one quad per grid edge the surface crosses. The
    field must be positive on the box boundary. Returns (verts, quads).
    """
    lo_a, hi_a = np.asarray(lo, float), np.asarray(hi, float)
    n = np.ceil((hi_a - lo_a) / step).astype(int) + 1
    axes = [lo_a[i] + np.arange(n[i]) * step for i in range(3)]
    grid = np.stack(np.meshgrid(*axes, indexing="ij"), axis=-1)
    d = f(grid.reshape(-1, 3)).reshape(n)
    cells = n - 1

    total = np.zeros((*cells, 3))
    count = np.zeros(cells)
    for axis in range(3):
        b, c = (axis + 1) % 3, (axis + 2) % 3
        for ob in (0, 1):
            for oc in (0, 1):
                off = [0, 0, 0]
                off[b], off[c] = ob, oc
                s0 = tuple(slice(off[i], off[i] + cells[i]) for i in range(3))
                off[axis] += 1
                s1 = tuple(slice(off[i], off[i] + cells[i]) for i in range(3))
                d0, d1 = d[s0], d[s1]
                cross = (d0 < 0) != (d1 < 0)
                t = np.where(cross, d0 / np.where(cross, d0 - d1, 1.0), 0.0)
                p0, p1 = grid[s0], grid[s1]
                total += np.where(cross[..., None], p0 + (p1 - p0) * t[..., None], 0.0)
                count += cross
    active = count > 0
    index = np.full(cells, -1, dtype=np.int64)
    index[active] = np.arange(int(active.sum()))
    verts = total[active] / count[active][:, None]

    quads = []
    for axis in range(3):
        b, c = (axis + 1) % 3, (axis + 2) % 3
        s0, s1 = [slice(None)] * 3, [slice(None)] * 3
        s0[axis], s1[axis] = slice(0, n[axis] - 1), slice(1, n[axis])
        for s in (s0, s1):
            s[b], s[c] = slice(1, n[b] - 1), slice(1, n[c] - 1)
        d0, d1 = d[tuple(s0)], d[tuple(s1)]
        cross = (d0 < 0) != (d1 < 0)
        base = np.argwhere(cross)
        base[:, b] += 1
        base[:, c] += 1

        def cell(db: int, dc: int) -> np.ndarray:
            q = base.copy()
            q[:, b] += db
            q[:, c] += dc
            return index[q[:, 0], q[:, 1], q[:, 2]]

        quad = np.stack([cell(-1, -1), cell(0, -1), cell(0, 0), cell(-1, 0)], axis=1)
        outward_minus = d0[cross] >= 0  # inside at the far end: the surface faces -axis
        quad[outward_minus] = quad[outward_minus][:, ::-1]
        quads.append(quad)
    return verts, np.concatenate(quads)


def project(f: Field, verts: np.ndarray, step: float, iterations: int = 4) -> np.ndarray:
    """Pull vertices onto the zero level (Newton steps, each at most ``step`` long)."""
    v = verts.copy()
    for _ in range(iterations):
        g = gradient(f, v, step * 0.05)
        move = (f(v) / np.maximum((g * g).sum(axis=1), 1e-12))[:, None] * g
        length = np.linalg.norm(move, axis=1, keepdims=True)
        v -= move * np.minimum(1.0, step / np.maximum(length, 1e-12))
    return v
