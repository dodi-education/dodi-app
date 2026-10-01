"""Export a character with accessories attached, to review the fit in a glTF viewer.

    blender --background characters/dodi/dodi.blend --python-exit-code 1 \\
        --python characters/blender/attach_preview.py -- ACCESSORY.glb [ACCESSORY.glb ...] --out OUT.glb

Viewers open one file at a time, so this bakes the accessories onto their
sockets in a copy of the character (clips included). The app attaches them at
runtime instead; this file is only for review.
"""

from __future__ import annotations

import argparse
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import kit  # noqa: E402


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("accessories", nargs="+")
    p.add_argument("--out", required=True)
    args = p.parse_args(sys.argv[sys.argv.index("--") + 1 :])

    scene = bpy.context.scene
    arm = next(o for o in scene.objects if o.type == "ARMATURE")
    for owner in [arm] + [o.data.shape_keys for o in scene.objects if o.type == "MESH" and o.data.shape_keys]:
        if owner.animation_data:
            owner.animation_data.action = None  # clips stay on their (muted) NLA tracks
            for track in owner.animation_data.nla_tracks:
                track.mute = True
        if hasattr(owner, "key_blocks"):
            for block in owner.key_blocks:
                block.value = 0.0
    kit.rest_pose(arm)
    for path in args.accessories:
        root, manifest = kit.attach_accessory(os.path.abspath(path))
        print(f"[attach] {manifest['name']} on {manifest['socket']}")
    kit.export_character(os.path.abspath(args.out))
    print(f"[attach] wrote {args.out}")


if __name__ == "__main__":
    main()
