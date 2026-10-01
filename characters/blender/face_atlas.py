"""The face atlas: every eye and mouth expression, drawn as anti-aliased
vector shapes with numpy (Blender's bundled Python has it; no Pillow needed).

Each cell is drawn in the physical units of the decal that shows it, so line
widths match across cells and against the model's outlines. Cell coordinates
are x forward (towards the beak), y up, origin at the cell's centre.
"""

from __future__ import annotations

import math
from collections.abc import Callable
from dataclasses import dataclass

import bpy
import numpy as np

from kit import AtlasCell

ATLAS_SIZE = (1024, 512)
# Transparent band inside every cell's border. Texture filtering (and the
# coarse mip levels used at grazing angles) reads across a picture's edge, so
# content there would bleed into the neighbouring cells' pictures.
GUTTER = 16

Shape = Callable[[np.ndarray, np.ndarray], np.ndarray]  # (x, y) -> signed distance


@dataclass(frozen=True)
class Paint:
    shape: Shape
    color: str


def disk(cx: float, cy: float, r: float) -> Shape:
    return lambda x, y: np.hypot(x - cx, y - cy) - r


def ring(cx: float, cy: float, r: float, width: float) -> Shape:
    return lambda x, y: np.abs(np.hypot(x - cx, y - cy) - r) - width / 2


def stroke(points: list[tuple[float, float]], width: float) -> Shape:
    """A round-capped polyline."""

    def sd(x: np.ndarray, y: np.ndarray) -> np.ndarray:
        best = np.full(x.shape, np.inf)
        for (ax, ay), (bx, by) in zip(points, points[1:]):
            dx, dy = bx - ax, by - ay
            t = np.clip(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy), 0.0, 1.0)
            best = np.minimum(best, np.hypot(x - ax - t * dx, y - ay - t * dy))
        return best - width / 2

    return sd


def arc(cx: float, cy: float, r: float, a0: float, a1: float, n: int = 32) -> list[tuple[float, float]]:
    """Points on a circular arc, angles in degrees, counter-clockwise."""
    return [
        (cx + r * math.cos(math.radians(a)), cy + r * math.sin(math.radians(a)))
        for a in np.linspace(a0, a1, n)
    ]


def bezier(p0: tuple[float, float], p1: tuple[float, float], p2: tuple[float, float], n: int = 32) -> list[tuple[float, float]]:
    out = []
    for t in np.linspace(0.0, 1.0, n):
        u = 1.0 - t
        out.append((u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]))
    return out


def _rgb(value: str) -> np.ndarray:
    h = value.lstrip("#")
    return np.array([int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)], dtype=np.float32)


def render_cell(paints: list[Paint], size_units: tuple[float, float], size_px: tuple[int, int]) -> np.ndarray:
    """Composite ``paints`` bottom-up into straight-alpha RGBA (top row first)."""
    w_px, h_px = size_px
    w_u, h_u = size_units
    px = w_u / w_px
    xs = (np.arange(w_px) + 0.5) * px - w_u / 2
    ys = h_u / 2 - (np.arange(h_px) + 0.5) * (h_u / h_px)
    x, y = np.meshgrid(xs, ys)
    rgb = np.zeros((h_px, w_px, 3), dtype=np.float32)
    alpha = np.zeros((h_px, w_px), dtype=np.float32)
    for paint in paints:
        a = np.clip(0.5 - paint.shape(x, y) / px, 0.0, 1.0).astype(np.float32)
        out_a = a + alpha * (1.0 - a)
        safe = np.where(out_a > 0, out_a, 1.0)
        rgb = (_rgb(paint.color) * a[..., None] + rgb * (alpha * (1.0 - a))[..., None]) / safe[..., None]
        alpha = out_a
    return np.concatenate([rgb, alpha[..., None]], axis=-1)


def build_atlas(
    cells: dict[str, tuple[AtlasCell, tuple[float, float], list[Paint]]],
    name: str,
    filepath: str,
) -> bpy.types.Image:
    """Draw every cell into one image, save it as PNG and pack it."""
    w, h = ATLAS_SIZE
    canvas = np.zeros((h, w, 4), dtype=np.float32)
    for name, (cell, size_units, paints) in cells.items():
        pixels = render_cell(paints, size_units, (cell.w, cell.h))
        border = np.ones((cell.h, cell.w), dtype=bool)
        border[GUTTER:-GUTTER, GUTTER:-GUTTER] = False
        if pixels[..., 3][border].max(initial=0.0) > 0.02:
            raise ValueError(f"face atlas cell '{name}' draws into its {GUTTER} px gutter; keep its content inside")
        pixels[..., 3][border] = 0.0
        canvas[cell.y : cell.y + cell.h, cell.x : cell.x + cell.w] = pixels
    image = bpy.data.images.new(name, w, h, alpha=True)
    image.alpha_mode = "STRAIGHT"
    image.pixels.foreach_set(canvas[::-1].ravel())
    image.filepath_raw = filepath
    image.file_format = "PNG"
    image.save()
    image.pack()
    return image
