"""Render toon-shaded, outlined previews of a built character.

    blender --background characters/dodi/dodi.blend \
        --python characters/blender/preview.py -- [--pose CLIP:FRAME] [--jaw DEG] [--face EYES:MOUTH]
        [--accessory characters/accessories/headphones/headphones.glb]

Emulates the intended runtime look without a GPU: flat two-tone colours from
each material's ``base_color``/``shade_color`` and outlines found from an
object-ID and a depth render (lines wherever parts meet or overlap), composed
with numpy. Writes PNGs to ``<character>/previews/``, including a side-by-side
comparison with the 2D reference art.
"""

from __future__ import annotations

import argparse
import colorsys
import json
import math
import os
import shutil
import sys

import bpy
import numpy as np
from mathutils import Euler, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import kit  # noqa: E402

CHAR_DIR = os.path.dirname(bpy.data.filepath)
OUT_DIR = os.path.join(CHAR_DIR, "previews")
REFERENCE = os.path.abspath(os.path.join(CHAR_DIR, "..", "..", "assets", "reference", "dodi_full.png"))

LIGHT_DIR = Vector((-0.15, -0.25, 1.0)).normalized()
SHADE_THRESHOLD = -0.2  # N·L below this is in shadow
SIZE = 700
LINE_RADIUS = 0.0095  # of the image height

# name: (azimuth from the character's right side towards its front, elevation), degrees
VIEWS = {
    "hero": (22.0, 6.0),
    "front": (90.0, 6.0),
    "side": (0.0, 0.0),
    "three-quarter": (50.0, 14.0),
    "back": (215.0, 12.0),
    "app": (55.0, 14.0),  # the apps' default camera (core/character/src/character-view.ts)
}


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--pose", default=None, help="clip:frame to pose before rendering")
    p.add_argument("--jaw", type=float, default=0.0, help="jaw opening in degrees")
    p.add_argument("--face", default=None, help="eyes:mouth states to show")
    p.add_argument("--views", default=",".join(VIEWS))
    p.add_argument("--suffix", default="")
    p.add_argument("--accessory", action="append", default=[], help="accessory .glb to wear (repeatable)")
    return p.parse_args(argv)


# ---------------------------------------------------------------------------
# Scene setup
# ---------------------------------------------------------------------------


def setup_render() -> None:
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.use_denoising = False
    scene.render.resolution_x = SIZE
    scene.render.resolution_y = SIZE
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.dither_intensity = 0.0
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    if scene.world is None:
        scene.world = bpy.data.worlds.new("world")
    scene.world.color = (0.0, 0.0, 0.0)


def emission_material(name: str, build) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    emit = nt.nodes.new("ShaderNodeEmission")
    nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
    build(nt, emit, out)
    return mat


def toon(base: str, shade: str) -> bpy.types.Material:
    def build(nt, emit, out):
        geo = nt.nodes.new("ShaderNodeNewGeometry")
        dot = nt.nodes.new("ShaderNodeVectorMath")
        dot.operation = "DOT_PRODUCT"
        dot.inputs[1].default_value = LIGHT_DIR
        nt.links.new(geo.outputs["Normal"], dot.inputs[0])
        ramp = nt.nodes.new("ShaderNodeMapRange")
        ramp.interpolation_type = "SMOOTHSTEP"
        ramp.inputs["From Min"].default_value = SHADE_THRESHOLD - 0.03
        ramp.inputs["From Max"].default_value = SHADE_THRESHOLD + 0.03
        nt.links.new(dot.outputs["Value"], ramp.inputs["Value"])
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        mix.inputs["A"].default_value = kit.hex_rgba(shade)
        mix.inputs["B"].default_value = kit.hex_rgba(base)
        nt.links.new(ramp.outputs["Result"], mix.inputs["Factor"])
        nt.links.new(mix.outputs["Result"], emit.inputs["Color"])

    return emission_material(f"preview_{base}_{shade}", build)


def unlit_decal(image: bpy.types.Image) -> bpy.types.Material:
    def build(nt, emit, out):
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = image
        transparent = nt.nodes.new("ShaderNodeBsdfTransparent")
        mix = nt.nodes.new("ShaderNodeMixShader")
        nt.links.new(tex.outputs["Color"], emit.inputs["Color"])
        nt.links.new(tex.outputs["Alpha"], mix.inputs["Fac"])
        nt.links.new(transparent.outputs["BSDF"], mix.inputs[1])
        nt.links.new(emit.outputs["Emission"], mix.inputs[2])
        nt.links.new(mix.outputs["Shader"], out.inputs["Surface"])

    return emission_material("preview_decal", build)


def flat(rgb: tuple[float, float, float], name: str) -> bpy.types.Material:
    def build(nt, emit, out):
        emit.inputs["Color"].default_value = (*rgb, 1.0)

    return emission_material(name, build)


def depth_material(far: float) -> bpy.types.Material:
    def build(nt, emit, out):
        cam = nt.nodes.new("ShaderNodeCameraData")
        div = nt.nodes.new("ShaderNodeMath")
        div.operation = "DIVIDE"
        div.inputs[1].default_value = far
        nt.links.new(cam.outputs["View Z Depth"], div.inputs[0])
        nt.links.new(div.outputs["Value"], emit.inputs["Color"])

    return emission_material("preview_depth", build)


def meshes() -> list[bpy.types.Object]:
    # Skips helper meshes without materials, e.g. the bone shape the glTF importer adds.
    return [o for o in bpy.context.scene.objects if o.type == "MESH" and o.data.materials and o.data.materials[0]]


def is_face(obj: bpy.types.Object) -> bool:
    """Pictures drawn on a surface (the face, an accessory's decals): unlit, no outline IDs."""
    return all(m.get("unlit") for m in obj.data.materials)


def set_materials(obj: bpy.types.Object, mats: list[bpy.types.Material]) -> None:
    for i, mat in enumerate(mats):
        obj.data.materials[i] = mat


# ---------------------------------------------------------------------------
# Posing
# ---------------------------------------------------------------------------


def assign(id_data: bpy.types.ID, action: bpy.types.Action | None) -> None:
    anim = id_data.animation_data or id_data.animation_data_create()
    for track in anim.nla_tracks:
        track.mute = True
    anim.action = action
    if action is not None and anim.action_slot is None and action.slots:
        anim.action_slot = action.slots[0]


def pose(args: argparse.Namespace) -> None:
    """Rest pose and default face, or a clip's frame; then optional overrides."""
    scene = bpy.context.scene
    arm = next(o for o in scene.objects if o.type == "ARMATURE")
    face = next((o for o in meshes() if o.data.shape_keys), None)
    keys = face.data.shape_keys if face else None
    assign(arm, None)
    kit.rest_pose(arm)
    if keys:
        assign(keys, None)
        for block in keys.key_blocks:
            block.value = 0.0
    if args.pose:
        name, frame = args.pose.split(":")
        assign(arm, bpy.data.actions[name])
        if keys and not args.face:
            assign(keys, bpy.data.actions.get(f"{name}_face"))
        scene.frame_set(int(frame))
    if args.jaw:
        arm.pose.bones["jaw"].rotation_mode = "XYZ"
        arm.pose.bones["jaw"].rotation_euler = Euler((math.radians(args.jaw), 0, 0))
    if args.face and keys:
        eyes, mouth = args.face.split(":")
        for block in keys.key_blocks[1:]:
            block.value = float(block.name in (f"eyes_{eyes}", f"mouth_{mouth}"))
    bpy.context.view_layer.update()


# ---------------------------------------------------------------------------
# Rendering
# ---------------------------------------------------------------------------


def camera(azimuth: float, elevation: float, match_art: bool) -> bpy.types.Object:
    cam_data = bpy.data.cameras.new("preview_cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = 350 / 340 if match_art else 1.12
    cam_data.clip_end = 20.0
    cam = kit.link(bpy.data.objects.new("preview_cam", cam_data))
    az, el = math.radians(azimuth), math.radians(elevation)
    to_cam = Vector((-math.cos(az) * math.cos(el), -math.sin(az) * math.cos(el), math.sin(el)))
    right = Vector((math.sin(az), -math.cos(az), 0.0))
    if match_art:
        # Frame the art's 350 px square: origin 22 px left of centre, ground 7 px above the bottom.
        target = right * ((175 - 153) / 340) + Vector((0.0, 0.0, (343 - 175) / 340))
    else:
        target = Vector((0.0, -0.1, 0.49))
    cam.location = target + to_cam * 5.0
    cam.rotation_euler = (-to_cam).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = cam
    return cam


def render_to(path: str, samples: int, filter_width: float, exr: bool) -> np.ndarray:
    scene = bpy.context.scene
    scene.cycles.samples = samples
    scene.cycles.filter_width = filter_width
    settings = scene.render.image_settings
    if exr:
        settings.file_format = "OPEN_EXR"
        settings.color_depth = "32"
    else:
        settings.file_format = "PNG"
        settings.color_mode = "RGBA"
        settings.color_depth = "8"
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    img = bpy.data.images.load(path, check_existing=False)
    px = np.array(img.pixels[:], dtype=np.float32).reshape(img.size[1], img.size[0], 4)[::-1]
    bpy.data.images.remove(img)
    return px


def edges(id_px: np.ndarray, depth: np.ndarray) -> np.ndarray:
    mask = np.zeros(id_px.shape[:2], dtype=bool)
    idv = id_px[..., :3] * id_px[..., 3:4] + (1 - id_px[..., 3:4]) * np.array([7.0, 7.0, 7.0])
    d = np.where(depth[..., 3] > 0.5, depth[..., 0], 10.0)
    for axis in (0, 1):
        diff_id = np.abs(np.diff(idv, axis=axis)).sum(-1) > 0.05
        diff_d = np.abs(np.diff(d, axis=axis)) > 0.004
        both = diff_id | diff_d
        if axis == 0:
            mask[:-1] |= both
            mask[1:] |= both
        else:
            mask[:, :-1] |= both
            mask[:, 1:] |= both
    return mask


def thicken(mask: np.ndarray, radius: float) -> np.ndarray:
    r = int(math.ceil(radius))
    h, w = mask.shape
    pad = np.pad(mask.astype(np.float32), r)
    out = np.zeros((h, w), dtype=np.float32)
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            cover = min(1.0, max(0.0, radius + 0.5 - math.hypot(dx, dy)))
            if cover > 0:
                np.maximum(out, pad[r + dy : r + dy + h, r + dx : r + dx + w] * cover, out=out)
    return out


def hex_srgb(value: str) -> np.ndarray:
    h = value.lstrip("#")
    return np.array([int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)], dtype=np.float32)


def save_png(rgba: np.ndarray, path: str) -> None:
    h, w = rgba.shape[:2]
    img = bpy.data.images.new("out", w, h, alpha=True)
    img.pixels.foreach_set(rgba[::-1].astype(np.float32).ravel())
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)


def over_white(rgba: np.ndarray) -> np.ndarray:
    rgb = rgba[..., :3] * rgba[..., 3:4] + (1 - rgba[..., 3:4])
    return np.concatenate([rgb, np.ones_like(rgba[..., :1])], -1)


def reference_art() -> np.ndarray | None:
    if not os.path.exists(REFERENCE):
        return None
    img = bpy.data.images.load(REFERENCE)
    w, h = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1]
    bpy.data.images.remove(img)
    scale = SIZE // w
    return np.repeat(np.repeat(px, scale, 0), scale, 1)


def main() -> None:
    args = parse_args()
    os.makedirs(OUT_DIR, exist_ok=True)
    tmp = os.path.join(OUT_DIR, ".tmp")
    os.makedirs(tmp, exist_ok=True)
    setup_render()
    for path in args.accessory:
        kit.attach_accessory(os.path.abspath(path))
    pose(args)
    manifest = json.loads(bpy.context.scene["character"])
    outline = hex_srgb(manifest["outline"]["color"])

    objs = meshes()
    decals = {o.name for o in objs if is_face(o)}  # before the preview materials replace theirs
    color_mats: dict[str, list[bpy.types.Material]] = {}
    id_mats: dict[str, list[bpy.types.Material]] = {}
    part = 0
    for obj in objs:
        color_mats[obj.name] = []
        for src in obj.data.materials:
            if obj.name in decals:
                image = next(n.image for n in src.node_tree.nodes if n.type == "TEX_IMAGE")
                color_mats[obj.name].append(unlit_decal(image))
            else:
                color_mats[obj.name].append(toon(src["base_color"], src["shade_color"]))
        if obj.name in decals:
            continue
        # One ID per material slot: painted regions get outlines like separate parts.
        id_mats[obj.name] = []
        for _ in obj.data.materials:
            rgb = colorsys.hsv_to_rgb((part * 0.618) % 1.0, 0.8, 0.4 + 0.6 * ((part * 0.37) % 1.0))
            id_mats[obj.name].append(flat(rgb, f"id_{part}"))
            part += 1
    depth = depth_material(10.0)
    art = reference_art()

    for view in args.views.split(","):
        az, el = VIEWS[view]
        cam = camera(az, el, match_art=view == "hero")
        for obj in objs:
            set_materials(obj, color_mats[obj.name])
            obj.hide_render = False
        color = render_to(os.path.join(tmp, "color.png"), 32, 1.5, exr=False)

        for obj in objs:
            if obj.name in decals:
                obj.hide_render = True
            else:
                set_materials(obj, id_mats[obj.name])
        ids = render_to(os.path.join(tmp, "id.exr"), 1, 0.01, exr=True)
        for obj in objs:
            if obj.name not in decals:
                set_materials(obj, [depth] * len(obj.data.materials))
        dep = render_to(os.path.join(tmp, "depth.exr"), 1, 0.01, exr=True)

        lines = thicken(edges(ids, dep), LINE_RADIUS * SIZE)[..., None]
        rgb = color[..., :3] * (1 - lines) + outline * lines
        alpha = np.maximum(color[..., 3:4], lines)
        result = np.concatenate([rgb, alpha], -1)
        name = f"{view}{args.suffix}"
        save_png(result, os.path.join(OUT_DIR, f"{name}.png"))
        if view == "hero" and art is not None:
            a, r = over_white(art), over_white(result)
            overlay = a * 0.5 + r * 0.5
            save_png(np.concatenate([a, r, overlay], axis=1), os.path.join(OUT_DIR, f"compare{args.suffix}.png"))
        bpy.data.objects.remove(cam)
        print(f"[preview] {name}")
    shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
