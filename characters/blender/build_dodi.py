"""Build the stock dodi character: mesh, rig, face, sockets and clips.

    blender --background --python characters/blender/build_dodi.py

Writes ``characters/dodi/dodi.glb`` (the runtime asset), ``dodi.blend`` (for
opening in Blender) and ``face-atlas.png``. Proportions are measured from
``assets/reference/dodi_full.png`` at 340 px = 1 unit, feet at z = 0.
"""

from __future__ import annotations

import json
import math
import os
import sys

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import face_atlas as fa  # noqa: E402
import kit  # noqa: E402
import sdf  # noqa: E402
from kit import AtlasCell, Blob, Bone, Key  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT_DIR = os.path.join(ROOT, "dodi")

FORMAT_VERSION = 1
FPS = 30

# Colours sampled from the 2D artwork (sRGB). ``shade`` is the toon shadow tone.
PALETTE = {
    "suit": ("#fbfcfd", "#a8ccd8"),
    "skin": ("#78b4d8", "#5f93bd"),
    "beak": ("#6c84a8", "#56709a"),
    "dark": ("#34506a", "#2a4258"),
    "mouth": ("#2c4868", "#223a55"),  # inside of the open mouth
}
OUTLINE_COLOR = "#34506a"
OUTLINE_WIDTH = 0.012  # model units; the artwork's lines are ~2% of its height

# ---------------------------------------------------------------------------
# Proportions (Blender units, the character faces -Y)
# ---------------------------------------------------------------------------

BODY = Blob(at=(0.0, 0.005, 0.34), radii=(0.25, 0.31, 0.225))
# The hood and neck are one piece that plunges into the body; where they meet
# is the tilted "collar" line of the artwork.
NECK = Blob(at=(0.0, -0.195, 0.52), radii=(0.115, 0.125, 0.15))
HOOD = Blob(at=(0.0, -0.12, 0.725), radii=(0.165, 0.165, 0.185))

# Head and beak are one smooth surface built from distance fields, so the
# snout runs into the beak without a step and the hook ends in a point. The
# beak is painted onto the front of it (see BEAK_BASE).
HEAD_CENTER = (0.0, -0.18, 0.72)
HEAD_RADIUS = 0.155
HEAD_BOUNDS = ((-0.2, -0.62, 0.48), (0.2, 0.02, 0.92))
HOOK_BACK_Y = -0.485  # in front of this the hook hangs below the gape; it stays with the head


# The beak's side view, clockwise from inside the snout: a flat top that
# continues the snout, one arc over the front into the hook, a sharp tip, the
# hook's inner side and the underside along the gape. Puffed out sideways
# with rounded edges, narrowing towards the tip.
BEAK_OUTLINE = [
    (-0.34, 0.735), (-0.4, 0.762), (-0.45, 0.768), (-0.495, 0.765),
    (-0.53, 0.752), (-0.556, 0.728), (-0.572, 0.695), (-0.578, 0.66),
    (-0.574, 0.625), (-0.562, 0.595), (-0.545, 0.57), (-0.524, 0.551), (-0.503, 0.537),
    (-0.507, 0.553), (-0.51, 0.572), (-0.505, 0.592), (-0.49, 0.607),
    (-0.45, 0.613), (-0.41, 0.62), (-0.36, 0.63), (-0.33, 0.66),
]
BEAK_BOX = ((-0.66, 0.46), (-0.28, 0.84))  # (y, z) box around the outline, with margin


def beak_width(p: np.ndarray) -> np.ndarray:
    """Half-width of the beak: wide over the snout, narrow along the hook."""
    return 0.034 + 0.032 * sdf.smoothstep(0.56, 0.67, p[:, 2]) - 0.008 * sdf.smoothstep(-0.47, -0.57, p[:, 1])


def head_field() -> sdf.Field:
    skull = sdf.ellipsoid(HEAD_CENTER, (0.16, HEAD_RADIUS, HEAD_RADIUS))
    snout = sdf.ellipsoid((0.0, -0.335, 0.675), (0.085, 0.1, 0.098))
    beak = sdf.inflate(sdf.outline(sdf.closed_spline(BEAK_OUTLINE), BEAK_BOX), beak_width, 0.04)
    # The blue lower jaw runs on under the beak and stops short of the hook.
    chin = sdf.ellipsoid((0.0, -0.42, 0.604), (0.044, 0.055, 0.024))
    face = sdf.smooth_union(0.04, skull, snout)
    return sdf.smooth_union(0.02, sdf.smooth_union(0.03, face, beak), chin)


def beak_region(co) -> float:
    """Negative on the beak: in front of its curved base line and above the
    gape, plus the whole hook."""
    base_y = -0.39 + 0.018 * (1.0 - ((co.z - 0.7) / 0.09) ** 2)
    upper = max(co.y - base_y, GAPE(co.y) - co.z)
    return min(upper, co.y - HOOK_BACK_Y)

# The blue belly is painted on the body: the body surface inside this ellipsoid.
BELLY = Blob(at=(0.0, -0.205, 0.27), radii=(0.19, 0.14, 0.2), rot=(30.0, 0.0, 0.0))

# The gape, in side view: height z of the mouth line along y. It follows the
# beak's lower edge and runs back to the mouth corner, like the 2D art, where
# the smile is the beak's line continuing into the cheek. In front of the
# corner the head is torn open along it and the part below hinges down to
# talk; both sides are closed inside by dark caps (see rig_head).
GAPE = kit.piecewise([
    (-0.62, 0.595), (-0.52, 0.6), (-0.48, 0.607), (-0.44, 0.614), (-0.4, 0.62), (-0.38, 0.624),
    (-0.34, 0.632), (-0.3, 0.64), (-0.265, 0.646), (-0.2, 0.648), (0.6, 0.648),
])
MOUTH_CORNER_Y = -0.265
JAW_HINGE = (0.0, -0.255, 0.63)

WING_SHOULDER = (0.2, -0.04, 0.43)
WING = [
    Blob(at=(0.205, 0.05, 0.35), radii=(0.045, 0.155, 0.12), rot=(-8.0, 0.0, 11.0)),
]
WING_NOTCH = Blob(at=(0.22, 0.2, 0.335), radii=(0.09, 0.1, 0.014), rot=(10.0, 0.0, 11.0), negative=True)

TAIL_BASE = (0.0, 0.27, 0.42)
# Feathers fan out from inside the rump: (elevation, spread) in degrees.
TAIL_FEATHERS = [(38.0, 0.0), (4.0, 22.0), (4.0, -22.0)]
TAIL_FEATHER = (0.026, 0.085, 0.045)  # thickness, length, width (semi-axes)

HIP = (0.075, 0.0, 0.15)
LEG = Blob(at=(0.075, 0.0, 0.10), radii=(0.032, 0.032, 0.065))
ANKLE = (0.075, -0.01, 0.05)
FOOT = [
    Blob(at=(0.075, -0.03, 0.028), radii=(0.05, 0.085, 0.028)),
    Blob(at=(0.075, -0.095, 0.022), radii=(0.042, 0.035, 0.022)),
]

ANTENNA_BASE = (0.05, -0.1, 0.87)
ANTENNA_TIP = (0.095, -0.065, 0.955)
ANTENNA_BALL = 0.027
ANTENNA_STALK = 0.008

# Face patches: eyes sit on the head sphere, 42° forward of the side, 22° up.
EYE_AZIMUTH, EYE_ELEVATION = 42.0, 22.0
EYE_SIZE = (0.13, 0.13)
# The mouth stroke's back end per expression: (y, lift above the gape) from
# the beak towards the corner. Its front part along the beak never changes.
MOUTH_ENDS = {
    "smile": [(-0.33, 0.001), (-0.31, 0.004), (-0.295, 0.009), (-0.282, 0.016), (-0.273, 0.025),
              (-0.268, 0.034), (-0.266, 0.043)],
    "neutral": [(-0.33, 0.0), (-0.31, 0.0), (-0.29, 0.0), (-0.275, 0.0), (-0.262, 0.0)],
    "frown": [(-0.33, -0.001), (-0.31, -0.004), (-0.295, -0.009), (-0.282, -0.015), (-0.273, -0.022),
              (-0.268, -0.03)],
}

SOCKETS = {
    "socket_head_top": ("head", (0.0, -0.13, 0.89)),
    "socket_eyes": ("head", (0.0, -0.30, 0.765)),
    "socket_ears": ("head", (0.0, -0.14, 0.715)),
    "socket_neck": ("neck", (0.0, -0.14, 0.55)),
    "socket_back": ("body", (0.0, 0.14, 0.50)),
}


def mirrored(point: tuple[float, float, float]) -> tuple[float, float, float]:
    return (-point[0], point[1], point[2])


def mirror_blob(b: Blob) -> Blob:
    return Blob(mirrored(b.at), b.radii, (b.rot[0], -b.rot[1], -b.rot[2]), b.stiffness, b.negative)


# ---------------------------------------------------------------------------
# Face atlas
# ---------------------------------------------------------------------------

LINE = 0.012  # stroke width of drawn face lines, model units
EYE_CELLS = {
    "open": AtlasCell(0, 0, 256, 256),
    "closed": AtlasCell(256, 0, 256, 256),
    "up": AtlasCell(512, 0, 256, 256),
    "happy": AtlasCell(768, 0, 256, 256),
    "sad": AtlasCell(0, 256, 256, 256),
}
INK_CELL = AtlasCell(256, 256, 256, 256)  # solid line colour for painted strokes
FACE_DEFAULTS = {"eyes": "open", "mouth": "smile"}

# The expression each clip holds, as (eyes, mouth); idle also blinks once per loop.
CLIP_FACES = {
    "idle": ("open", "smile"),
    "listen": ("open", "smile"),
    "think": ("up", "neutral"),
    "talk": ("open", "smile"),
    "sleep": ("closed", "neutral"),
    "happy": ("happy", "smile"),
    "sad": ("sad", "frown"),
    "deaf": ("open", "smile"),
}
IDLE_BLINK = [(46, 0.0), (48, 1.0), (50, 1.0), (53, 0.0)]


def face_paints() -> dict[str, tuple[AtlasCell, tuple[float, float], list[fa.Paint]]]:
    dark, white = OUTLINE_COLOR, "#ffffff"
    r = 0.05
    open_eye = [
        fa.Paint(fa.disk(0, 0, r), dark),
        fa.Paint(fa.disk(0.014, 0.017, 0.017), white),
        fa.Paint(fa.disk(-0.015, -0.019, 0.007), white),
    ]
    lashes = [
        fa.Paint(fa.stroke([(-0.03, -0.012), (-0.043, -0.022)], LINE * 0.8), dark),
        fa.Paint(fa.stroke([(-0.021, -0.02), (-0.029, -0.033)], LINE * 0.8), dark),
    ]
    return {
        "eyes_open": (EYE_CELLS["open"], EYE_SIZE, open_eye),
        "eyes_closed": (
            EYE_CELLS["closed"],
            EYE_SIZE,
            [fa.Paint(fa.stroke(fa.arc(0, 0.01, 0.034, 200, 340), LINE), dark), *lashes],
        ),
        "eyes_up": (
            EYE_CELLS["up"],
            EYE_SIZE,
            [
                fa.Paint(fa.disk(0, 0, r - 0.002), white),
                fa.Paint(fa.ring(0, 0, r - 0.006, 0.009), dark),
                fa.Paint(fa.disk(0.004, 0.017, 0.026), dark),
                fa.Paint(fa.disk(0.012, 0.026, 0.008), white),
            ],
        ),
        "eyes_happy": (
            EYE_CELLS["happy"],
            EYE_SIZE,
            [fa.Paint(fa.stroke(fa.arc(0, -0.014, 0.032, 20, 160), LINE), dark)],
        ),
        "eyes_sad": (
            EYE_CELLS["sad"],
            EYE_SIZE,
            [
                # Glossy, slightly smaller eye under a brow raised at its inner (beak) end,
                # both kept clear of the cell's transparent gutter.
                fa.Paint(fa.disk(0, -0.014, r - 0.008), dark),
                fa.Paint(fa.disk(0.011, 0.0006, 0.0164), white),
                fa.Paint(fa.disk(-0.0119, -0.0304, 0.0082), white),
                fa.Paint(fa.disk(0.0164, -0.0268, 0.0046), white),
                fa.Paint(fa.stroke(fa.bezier((-0.038, 0.04), (-0.006, 0.042), (0.026, 0.051)), LINE * 0.85), dark),
            ],
        ),
        # Strokes sample the cell's centre only; a centred disk leaves a wide
        # transparent margin so no filtering carries ink into neighbouring cells.
        "ink": (INK_CELL, EYE_SIZE, [fa.Paint(fa.disk(0, 0, 0.03), dark)]),
    }


# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------


def tail_feathers() -> list[Blob]:
    thickness, length, width = TAIL_FEATHER
    feathers = []
    for elevation, spread in TAIL_FEATHERS:
        el, sp = math.radians(elevation), math.radians(spread)
        direction = (math.sin(sp) * math.cos(el), math.cos(sp) * math.cos(el), math.sin(el))
        at = tuple(b + d * (length + 0.01) for b, d in zip(TAIL_BASE, direction))
        feathers.append(Blob(at=at, radii=(thickness, length, width), rot=(elevation, 0.0, -spread)))
    return feathers


def build_meshes(mats: dict[str, bpy.types.Material]) -> dict[str, bpy.types.Object]:
    parts: dict[str, bpy.types.Object] = {}
    parts["body"] = kit.blob_mesh("body", [BODY], mats["suit"], max_tris=2000)
    kit.paint_region(parts["body"], kit.ellipsoid_field(BELLY), mats["skin"])
    parts["hood"] = kit.blob_mesh("hood", [NECK, HOOD], mats["suit"], max_tris=1800)
    parts["head"] = kit.sdf_mesh("head", head_field(), HEAD_BOUNDS, 0.004, mats["skin"], max_tris=6000)
    kit.paint_region(parts["head"], beak_region, mats["beak"])
    # Cut the gape (where rig_head tears the mouth open) now, so the face is
    # projected onto the final surface; the mouth material is for its caps.
    kit.cut(parts["head"], lambda co: co.y - HOOK_BACK_Y, lambda co: co.y - MOUTH_CORNER_Y)
    kit.cut(parts["head"], lambda co: co.z - GAPE(co.y), mark=True)
    parts["head"].data.materials.append(mats["mouth"])
    for i, feather in enumerate(tail_feathers()):
        parts[f"tail_{i}"] = kit.blob_mesh(f"tail_{i}", [feather], mats["skin"], resolution=0.006, max_tris=400)
    for side, flip in (("L", False), ("R", True)):
        def m(b: Blob) -> Blob:
            return mirror_blob(b) if flip else b

        parts[f"wing_{side}"] = kit.blob_mesh(
            f"wing_{side}", [*map(m, WING), m(WING_NOTCH)], mats["suit"], resolution=0.007, max_tris=700
        )
        parts[f"leg_{side}"] = kit.blob_mesh(f"leg_{side}", [m(LEG)], mats["skin"], resolution=0.006, max_tris=300)
        parts[f"foot_{side}"] = kit.blob_mesh(
            f"foot_{side}", list(map(m, FOOT)), mats["skin"], resolution=0.006, max_tris=500
        )
        base = mirrored(ANTENNA_BASE) if flip else ANTENNA_BASE
        tip = mirrored(ANTENNA_TIP) if flip else ANTENNA_TIP
        stalk = kit.tube(f"antenna_stalk_{side}", [base, tip], ANTENNA_STALK, mats["dark"])
        ball = kit.blob_mesh(
            f"antenna_ball_{side}", [Blob(tip, ANTENNA_BALL)], mats["beak"], resolution=0.005, max_tris=300
        )
        parts[f"antenna_stalk_{side}"] = stalk
        parts[f"antenna_ball_{side}"] = ball
    return parts


def mouth_line(ends: list[tuple[float, float]]) -> list[tuple[float, float]]:
    """The mouth stroke in side view: along the beak's lower edge, then back
    along the gape, finishing in the expression's ``ends``. The stroke sits
    just above the gape, on the upper lip, so it stays there when the jaw opens."""
    lift = LINE / 2
    front = [(y, GAPE(y) + lift) for y in (-0.47, -0.44, -0.41, -0.38, -0.35)]
    back = [front[-1]] + [(y, GAPE(y) + lift + dz) for y, dz in ends]
    return kit.resample(front, 10)[:-1] + kit.resample(back, 22)


def build_face(head: bpy.types.Object, image: bpy.types.Image) -> bpy.types.Object:
    """Eyes (atlas pictures) and the mouth (a painted stroke per expression) in
    one mesh whose morph targets switch the expression."""
    patches: list[tuple[str, str, kit.Patch]] = []
    az, el = math.radians(EYE_AZIMUTH), math.radians(EYE_ELEVATION)
    for sign in (1.0, -1.0):
        normal = (sign * math.cos(az) * math.cos(el), -math.sin(az) * math.cos(el), math.sin(el))
        center = tuple(c + n * HEAD_RADIUS for c, n in zip(HEAD_CENTER, normal))
        for state, cell in EYE_CELLS.items():
            patches.append(("eyes", state, kit.decal_patch(head, center, normal, EYE_SIZE, cell, fa.ATLAS_SIZE)))
    for state, ends in MOUTH_ENDS.items():
        for sign in (1.0, -1.0):
            stroke = kit.surface_stroke([head], mouth_line(ends), sign, LINE, INK_CELL, fa.ATLAS_SIZE)
            patches.append(("mouth", state, stroke))
    return kit.face_mesh("face", patches, FACE_DEFAULTS, kit.decal_material("face", image))


def build_rig() -> bpy.types.Object:
    head_pivot = (0.0, -0.16, 0.645)
    bones = [
        Bone("root", (0.0, 0.0, 0.0), None, 0.1),
        Bone("body", BODY.at, "root"),
        Bone("neck", (0.0, -0.14, 0.48), "body"),
        Bone("head", head_pivot, "neck"),
        Bone("jaw", JAW_HINGE, "head", 0.03),
        Bone("tail", TAIL_BASE, "body"),
    ]
    for side, flip in (("L", False), ("R", True)):
        def m(p: tuple[float, float, float]) -> tuple[float, float, float]:
            return mirrored(p) if flip else p

        bones += [
            Bone(f"antenna_{side}", m(ANTENNA_BASE), "head", 0.03),
            Bone(f"wing_{side}", m(WING_SHOULDER), "body"),
            Bone(f"leg_{side}", m(HIP), "body", 0.04),
            Bone(f"foot_{side}", m(ANKLE), "root", 0.03),
        ]
    return kit.armature("dodi", bones)


def hood_weights(v) -> dict[str, float]:
    head = kit.smoothstep(0.58, 0.68, v.co.z)
    neck = (1.0 - head) * kit.smoothstep(0.4, 0.5, v.co.z)
    return {"head": head, "neck": neck, "body": 1.0 - head - neck}


def leg_weights(side: str):
    def weights(v) -> dict[str, float]:
        foot = 1.0 - kit.smoothstep(0.05, 0.09, v.co.z)
        return {f"foot_{side}": foot, f"leg_{side}": 1.0 - foot}

    return weights


def rig_head(head: bpy.types.Object, arm: bpy.types.Object) -> None:
    """Tear the head open along the gape in front of the mouth corner and
    hinge the part below to the jaw.

    Both sides of the tear are closed by dark caps (the mouth's roof and
    floor), which meet on a hinge line across the back at the corners. Opened,
    the gap between them is empty, so the beak can be looked through from the
    side, while from the front or below you see the dark inside of the mouth.
    The jaw's pull fades out around the corner so the skin stretches there
    smoothly.
    """
    tear = kit.tear_open(
        head,
        lambda co: co.z - GAPE(co.y),
        lambda co: HOOK_BACK_Y < co.y < MOUTH_CORNER_Y,
        head.data.materials.find("mouth"),
    )
    head_side = set(tear.upper) | set(tear.roof)
    jaw_side = set(tear.lower) | set(tear.floor)
    hinged = set(tear.corners) | set(tear.hinge)

    def taper(y: float) -> float:
        return kit.smoothstep(MOUTH_CORNER_Y + 0.02, MOUTH_CORNER_Y - 0.03, y)

    def weights(v) -> dict[str, float]:
        if v.index in head_side:
            jaw = 0.0
        elif v.index in jaw_side or v.index in hinged:
            jaw = taper(v.co.y)
        else:
            below = v.co.z <= GAPE(v.co.y) + 1e-6 and v.co.y > HOOK_BACK_Y
            jaw = taper(v.co.y) if below else 0.0
        return {"jaw": jaw, "head": 1.0 - jaw}

    kit.field_normals(head, head_field(), keep=set(tear.roof) | set(tear.floor) | set(tear.hinge))
    kit.skin(head, arm, weights)


def bind(parts: dict[str, bpy.types.Object], face: bpy.types.Object, arm: bpy.types.Object) -> None:
    kit.skin(parts["hood"], arm, hood_weights)
    rig_head(parts["head"], arm)
    rigid = {
        "body": "body",
        **{f"tail_{i}": "tail" for i in range(len(TAIL_FEATHERS))},
    }
    for side in ("L", "R"):
        rigid |= {
            f"wing_{side}": f"wing_{side}",
            f"foot_{side}": f"foot_{side}",
            f"antenna_stalk_{side}": f"antenna_{side}",
            f"antenna_ball_{side}": f"antenna_{side}",
        }
        kit.skin(parts[f"leg_{side}"], arm, leg_weights(side))
    for part, bone in rigid.items():
        kit.attach(parts[part], arm, bone)
    kit.attach(face, arm, "head")
    for name, (bone, at) in SOCKETS.items():
        kit.socket(name, arm, bone, at)


def build_clips(arm: bpy.types.Object, face: bpy.types.Object) -> list[str]:
    """Body-language loops, each with its facial expression (morph weights) so
    any glTF viewer plays them as intended. The runtime adds the voice-driven
    jaw, antenna wobble and extra blinks on top."""
    both = ("L", "R")
    clips: dict[str, tuple[int, dict[str, list[Key]]]] = {
        "idle": (
            72,
            {
                "body": [Key(0), Key(36, loc=(0, 0.006, 0)), Key(72)],
                "head": [Key(0), Key(18, rot=(-2, 2, 2)), Key(54, rot=(1, -2, -2)), Key(72)],
                "tail": [Key(0), Key(24, rot=(-4, 5, 0)), Key(48, rot=(-2, -5, 0)), Key(72)],
                **{f"wing_{s}": [Key(0), Key(36, rot=(0, 0, 3 if s == "L" else -3)), Key(72)] for s in both},
            },
        ),
        "listen": (
            60,
            {
                "body": [Key(0, rot=(3, 0, 0)), Key(30, rot=(4, 0, 0), loc=(0, 0.004, 0)), Key(60, rot=(3, 0, 0))],
                "head": [Key(0, rot=(4, 6, -12)), Key(30, rot=(5, 4, -14)), Key(60, rot=(4, 6, -12))],
                "tail": [Key(0), Key(30, rot=(-6, 0, 0)), Key(60)],
            },
        ),
        "think": (
            72,
            {
                "body": [Key(0), Key(36, loc=(0, 0.004, 0)), Key(72)],
                "head": [Key(0, rot=(-14, 4, -6)), Key(36, rot=(-16, -4, -6)), Key(72, rot=(-14, 4, -6))],
                **{f"antenna_{s}": [Key(0, rot=(-6, 0, 0)), Key(36, rot=(-10, 0, 0)), Key(72, rot=(-6, 0, 0))] for s in both},
            },
        ),
        "talk": (
            36,
            {
                "body": [Key(0), Key(9, loc=(0, 0.008, 0)), Key(18), Key(27, loc=(0, 0.005, 0)), Key(36)],
                "head": [Key(0), Key(9, rot=(-4, 2, 0)), Key(18, rot=(2, -2, 0)), Key(27, rot=(-3, 0, 2)), Key(36)],
                "jaw": [Key(0), Key(5, rot=(12, 0, 0)), Key(12), Key(20, rot=(9, 0, 0)), Key(27), Key(31, rot=(7, 0, 0)), Key(36)],
            },
        ),
        "sleep": (
            90,
            {
                "body": [Key(0, loc=(0, -0.012, 0)), Key(45, loc=(0, -0.004, 0)), Key(90, loc=(0, -0.012, 0))],
                "neck": [Key(0, rot=(10, 0, 0)), Key(45, rot=(8, 0, 0)), Key(90, rot=(10, 0, 0))],
                "head": [Key(0, rot=(16, 0, 6)), Key(45, rot=(13, 0, 6)), Key(90, rot=(16, 0, 6))],
                # Antennae flop outwards (roll away from the head), not forwards into the hood.
                **{
                    f"antenna_{s}": [
                        Key(0, rot=(6, 0, -22 if s == "L" else 22)),
                        Key(45, rot=(4, 0, -18 if s == "L" else 18)),
                        Key(90, rot=(6, 0, -22 if s == "L" else 22)),
                    ]
                    for s in both
                },
            },
        ),
        "happy": (
            30,
            {
                "root": [Key(0), Key(4, loc=(0, -0.01, 0)), Key(12, loc=(0, 0.07, 0)), Key(22), Key(26, loc=(0, -0.006, 0)), Key(30)],
                "head": [Key(0), Key(12, rot=(-10, 0, 0)), Key(30)],
                "tail": [Key(0), Key(8, rot=(0, 12, 0)), Key(16, rot=(0, -12, 0)), Key(24, rot=(0, 8, 0)), Key(30)],
                **{
                    f"wing_{s}": [Key(0), Key(10, rot=(0, 0, 40 if s == "L" else -40)), Key(16, rot=(0, 0, 15 if s == "L" else -15)), Key(22, rot=(0, 0, 35 if s == "L" else -35)), Key(30)]
                    for s in both
                },
            },
        ),
        # Slumped with a slow sigh: for hunger and other sad moments.
        "sad": (
            90,
            {
                "body": [
                    Key(0, rot=(3, 0, 0), loc=(0, -0.012, 0)),
                    Key(30, rot=(3, 0, 0), loc=(0, -0.012, 0)),
                    Key(45, rot=(1, 0, 0), loc=(0, -0.004, 0)),
                    Key(62, rot=(4, 0, 0), loc=(0, -0.015, 0)),
                    Key(90, rot=(3, 0, 0), loc=(0, -0.012, 0)),
                ],
                "neck": [Key(0, rot=(8, 0, 0)), Key(45, rot=(6, 0, 0)), Key(90, rot=(8, 0, 0))],
                "head": [Key(0, rot=(14, 0, 6)), Key(45, rot=(10, 0, 5)), Key(62, rot=(16, 0, 7)), Key(90, rot=(14, 0, 6))],
                "tail": [Key(0, rot=(-12, 0, 0)), Key(45, rot=(-9, 0, 0)), Key(90, rot=(-12, 0, 0))],
                **{
                    f"wing_{s}": [Key(0, rot=(0, 0, -5 if s == "L" else 5)), Key(45, rot=(0, 0, -3 if s == "L" else 3)), Key(90, rot=(0, 0, -5 if s == "L" else 5))]
                    for s in both
                },
                **{
                    f"antenna_{s}": [Key(0, rot=(4, 0, -14 if s == "L" else 14)), Key(45, rot=(2, 0, -11 if s == "L" else 11)), Key(90, rot=(4, 0, -14 if s == "L" else 14))]
                    for s in both
                },
            },
        ),
        # Bobbing to music under headphones (the headphones accessory sits on socket_ears):
        # four beats at 75 bpm, nodding on the beat, swaying over the bar.
        "deaf": (
            96,
            {
                "body": [Key(f, loc=(0, -0.004 if f % 24 == 0 else 0.004, 0)) for f in range(0, 97, 12)],
                "head": [
                    Key(f, rot=(6 if f % 24 == 0 else -1, 0, -3 + 6 * (min(f, 96 - f) / 48)))
                    for f in range(0, 97, 12)
                ],
                "tail": [Key(f, rot=(0, (8 if (f // 24) % 2 == 0 else -8) if f % 24 == 0 else 0, 0)) for f in range(0, 97, 12)],
                **{
                    f"wing_{s}": [Key(f, rot=(0, 0, (4 if s == "L" else -4) if f % 24 == 0 else 0)) for f in range(0, 97, 12)]
                    for s in both
                },
                **{
                    f"antenna_{s}": [Key(f, rot=(-6 if f % 24 == 0 else 5, 0, 0)) for f in range(0, 97, 12)]
                    for s in both
                },
            },
        ),
    }
    targets = [block.name for block in face.data.shape_keys.key_blocks[1:]]
    for name, (frames, tracks) in clips.items():
        kit.clip(arm, name, frames, tracks)
        kit.push_to_nla(arm, name)
        shown = {f"eyes_{CLIP_FACES[name][0]}", f"mouth_{CLIP_FACES[name][1]}"}
        weights = {t: [(0, float(t in shown)), (frames, float(t in shown))] for t in targets}
        if name == "idle":
            weights["eyes_closed"] = [(0, 0.0), *IDLE_BLINK, (frames, 0.0)]
        kit.shape_clip(face, f"{name}_face", frames, weights)
        kit.push_to_nla(face.data.shape_keys, name)
    return list(clips)


def manifest(clips: list[str]) -> dict:
    return {
        "format": "character",
        "version": FORMAT_VERSION,
        "name": "dodi",
        "height": 1.0,
        "outline": {"color": OUTLINE_COLOR, "width": OUTLINE_WIDTH},
        "face": {
            "eyes": list(EYE_CELLS),
            "mouth": list(MOUTH_ENDS),
            "default": FACE_DEFAULTS,
            "blink": "closed",
        },
        "jaw": {"bone": "jaw", "axis": "x", "open_degrees": 14},
        "springs": ["antenna_L", "antenna_R"],
        "clips": clips,
        "sockets": list(SOCKETS),
    }


def main() -> None:
    kit.reset_scene()
    scene = bpy.context.scene
    scene.render.fps = FPS
    os.makedirs(OUT_DIR, exist_ok=True)

    mats = {key: kit.toon_material(key, base, shade) for key, (base, shade) in PALETTE.items()}
    atlas = fa.build_atlas(face_paints(), "face_atlas", os.path.join(OUT_DIR, "face-atlas.png"))

    parts = build_meshes(mats)
    face = build_face(parts["head"], atlas)
    arm = build_rig()
    bind(parts, face, arm)
    clips = build_clips(arm, face)

    info = manifest(clips)
    scene["character"] = json.dumps(info)
    for obj in scene.objects:
        obj.select_set(False)
    tris = sum(kit.triangle_count(o) for o in scene.objects if o.type == "MESH")
    print(f"[dodi] {len([o for o in scene.objects if o.type == 'MESH'])} meshes, {tris} triangles")

    # The exporter bakes muted NLA tracks too; muting them keeps the evaluated
    # state (which becomes the file's rest pose and default face) neutral.
    for id_data in (arm, face.data.shape_keys):
        for track in id_data.animation_data.nla_tracks:
            track.mute = True
    for block in face.data.shape_keys.key_blocks:
        block.value = 0.0
    kit.rest_pose(arm)
    bpy.context.view_layer.update()

    kit.export_character(os.path.join(OUT_DIR, "dodi.glb"))
    kit.publish_to_web(os.path.join(OUT_DIR, "dodi.glb"), "dodi.glb")
    prepare_for_viewing(arm, face)
    bpy.context.preferences.filepaths.save_version = 0  # no dodi.blend1 backups
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT_DIR, "dodi.blend"))
    print(f"[dodi] wrote {OUT_DIR}")


def prepare_for_viewing(arm: bpy.types.Object, face: bpy.types.Object) -> None:
    """Make the saved .blend pleasant to open: the idle clip (with its blink)
    ready to play and material colours in the viewport."""
    for id_data, action in ((arm, "idle"), (face.data.shape_keys, "idle_face")):
        anim = id_data.animation_data
        anim.action = bpy.data.actions[action]
        if anim.action_slot is None and anim.action.slots:
            anim.action_slot = anim.action.slots[0]
    scene = bpy.context.scene
    scene.frame_start, scene.frame_end = 0, int(bpy.data.actions["idle"].frame_end)
    scene.frame_set(0)
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == "VIEW_3D":
                area.spaces.active.shading.color_type = "MATERIAL"


if __name__ == "__main__":
    main()
