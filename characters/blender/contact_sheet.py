"""Tile same-sized PNGs into one image over white.

    blender --background --python characters/blender/contact_sheet.py -- OUT.png COLUMNS IN.png...
"""

from __future__ import annotations

import sys

import bpy
import numpy as np


def load(path: str) -> np.ndarray:
    img = bpy.data.images.load(path)
    w, h = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1]  # top row first
    bpy.data.images.remove(img)
    rgb = px[..., :3] * px[..., 3:4] + (1 - px[..., 3:4])
    return np.concatenate([rgb, np.ones((h, w, 1), dtype=np.float32)], -1)


def main() -> None:
    out, columns, *paths = sys.argv[sys.argv.index("--") + 1 :]
    cols = int(columns)
    tiles = [load(p) for p in paths]
    h, w = tiles[0].shape[:2]
    rows = (len(tiles) + cols - 1) // cols
    sheet = np.ones((rows * h, cols * w, 4), dtype=np.float32)
    for i, tile in enumerate(tiles):
        r, c = divmod(i, cols)
        sheet[r * h : (r + 1) * h, c * w : (c + 1) * w] = tile
    img = bpy.data.images.new("sheet", cols * w, rows * h)
    img.pixels.foreach_set(sheet[::-1].ravel())  # Blender stores the bottom row first
    img.filepath_raw = out
    img.file_format = "PNG"
    img.save()


if __name__ == "__main__":
    main()
