"""Building blocks for procedurally modelled characters.

Runs inside Blender (``blender --background --python ...``). Coordinates are
Blender's: Z up, the character faces -Y, which the glTF exporter turns into
the format's Y up / +Z forward.

Every bone is created pointing straight up with zero roll, so its rest
rotation exports as identity: at runtime a bone's local X is the character's
left-right axis (pitch), Y is up (yaw) and Z is forward (roll).
"""

from __future__ import annotations

import math
import os
from collections.abc import Callable, Iterable
from dataclasses import dataclass

import bmesh
import bpy
import numpy as np
from mathutils import Euler, Vector
from mathutils.bvhtree import BVHTree

import sdf

Vec3 = tuple[float, float, float]

# Blender's metaball field is stiffness * (1 - d²/r²)³; the surface sits where
# the summed field crosses this threshold.
MB_THRESHOLD = 0.6


# --------------------------------------------------------------------------
# Scene and colour
# --------------------------------------------------------------------------


def export_character(path: str) -> None:
    """Export the whole scene as a character .glb with the format's settings.

    Clips must be NLA tracks (see ``push_to_nla``), muted, with the pose and
    morph weights at rest: muted tracks still export, and whatever the scene
    shows becomes the file's rest state.
    """
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_extras=True,
        export_skins=True,
        export_def_bones=False,
        export_leaf_bone=False,
        export_animations=True,
        export_animation_mode="NLA_TRACKS",  # merges bone and morph tracks per clip
        export_morph_normal=False,  # the face is unlit
        export_force_sampling=True,
        export_reset_pose_bones=True,
        export_anim_slide_to_zero=True,
        export_optimize_animation_size=True,
    )


def export_accessory(path: str, root: bpy.types.Object) -> None:
    """Export ``root`` and everything under it as a static accessory .glb."""
    for obj in bpy.context.scene.objects:
        obj.select_set(False)
    for obj in [root, *root.children_recursive]:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_extras=True,
        export_animations=False,
        use_selection=True,
    )


# The web app serves the runtime assets from its public folder.
WEB_CHARACTERS = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "clients", "web", "public", "characters")
)


def publish_to_web(path: str, name: str) -> None:
    """Copy an exported .glb to ``clients/web/public/characters/<name>``, the
    URL the app loads it from."""
    import shutil

    target = os.path.join(WEB_CHARACTERS, name)
    os.makedirs(os.path.dirname(target), exist_ok=True)
    shutil.copyfile(path, target)


def attach_accessory(path: str) -> tuple[bpy.types.Object, dict]:
    """Import an accessory .glb into the current character scene and hang it on
    the socket its manifest names. Returns (the accessory's root, manifest)."""
    import json

    scene = bpy.context.scene
    before = set(scene.objects)
    character = scene.get("character")
    bpy.ops.import_scene.gltf(filepath=path)
    manifest = json.loads(scene["accessory"])
    del scene["accessory"]
    if character is not None:
        scene["character"] = character  # the import must not replace the character's manifest
    new = [o for o in scene.objects if o not in before]
    root = next(o for o in new if o.parent is None or o.parent not in new)
    socket = scene.objects[manifest["socket"]]
    root.parent = socket
    root.matrix_parent_inverse.identity()
    root.location = (0.0, 0.0, 0.0)
    root.rotation_mode = "QUATERNION"
    root.rotation_quaternion = (1.0, 0.0, 0.0, 0.0)
    root.scale = (1.0, 1.0, 1.0)
    bpy.context.view_layer.update()
    return root, manifest


def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def srgb_to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_rgba(value: str) -> tuple[float, float, float, float]:
    """``#rrggbb`` (sRGB) as the linear RGBA Blender stores in materials."""
    h = value.lstrip("#")
    r, g, b = (int(h[i : i + 2], 16) / 255 for i in (0, 2, 4))
    return (srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b), 1.0)


def link(obj: bpy.types.Object) -> bpy.types.Object:
    bpy.context.scene.collection.objects.link(obj)
    return obj


# --------------------------------------------------------------------------
# Materials
# --------------------------------------------------------------------------


def toon_material(name: str, base: str, shade: str) -> bpy.types.Material:
    """A flat colour for glTF, plus the toon shadow colour as material extras.

    glTF has no toon model, so the base colour carries the lit tone and the
    renderer reads ``shade_color`` (sRGB hex) for the shadow band.
    """
    mat = bpy.data.materials.new(name)
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = hex_rgba(base)
    bsdf.inputs["Roughness"].default_value = 1.0
    bsdf.inputs["Metallic"].default_value = 0.0
    mat.diffuse_color = hex_rgba(base)
    mat["base_color"] = base
    mat["shade_color"] = shade
    return mat


def decal_material(name: str, image: bpy.types.Image) -> bpy.types.Material:
    """Unlit, alpha-blended material for face decals sampling the atlas."""
    mat = bpy.data.materials.new(name)
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes["Principled BSDF"]
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = image
    tex.interpolation = "Linear"
    tex.extension = "EXTEND"  # exported as CLAMP_TO_EDGE: no wrap-around into the far edge's cells
    links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
    bsdf.inputs["Roughness"].default_value = 1.0
    mat.surface_render_method = "BLENDED"
    mat.use_backface_culling = True
    mat["unlit"] = True
    return mat


# --------------------------------------------------------------------------
# Metaball blobs
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class Blob:
    """One metaball element, sized by the surface it would have on its own.

    ``radii`` are the visible semi-axes (x, y, z) of the isolated element;
    ``rot`` is an XYZ Euler in degrees. Neighbouring blobs of the same mesh
    melt into each other, which is what gives the joins their soft fillets.
    """

    at: Vec3
    radii: Vec3 | float
    rot: Vec3 = (0.0, 0.0, 0.0)
    stiffness: float = 2.0
    negative: bool = False


def _field_radius(visible: float, stiffness: float) -> float:
    return visible / math.sqrt(1.0 - (MB_THRESHOLD / stiffness) ** (1.0 / 3.0))


def blob_mesh(
    name: str,
    blobs: Iterable[Blob],
    material: bpy.types.Material,
    *,
    resolution: float = 0.01,
    max_tris: int | None = None,
) -> bpy.types.Object:
    """Polygonise metaball elements into a smooth-shaded mesh object."""
    mb = bpy.data.metaballs.new(f"{name}_field")
    mb.threshold = MB_THRESHOLD
    mb.resolution = resolution
    mb.render_resolution = resolution
    for b in blobs:
        radii = (b.radii,) * 3 if isinstance(b.radii, (int, float)) else b.radii
        largest = max(radii)
        el = mb.elements.new()
        el.type = "ELLIPSOID"
        el.co = b.at
        el.radius = _field_radius(largest, b.stiffness)
        el.stiffness = b.stiffness
        el.size_x, el.size_y, el.size_z = (r / largest for r in radii)
        el.rotation = Euler([math.radians(a) for a in b.rot]).to_quaternion()
        el.use_negative = b.negative
    field = link(bpy.data.objects.new(f"{name}_field", mb))

    depsgraph = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(field.evaluated_get(depsgraph))
    bpy.data.objects.remove(field)
    bpy.data.metaballs.remove(mb)

    mesh.name = name
    obj = link(bpy.data.objects.new(name, mesh))
    if max_tris is not None:
        decimate(obj, max_tris)
    obj.data.shade_smooth()
    obj.data.materials.append(material)
    return obj


def sdf_mesh(
    name: str,
    field: sdf.Field,
    bounds: tuple[Vec3, Vec3],
    step: float,
    material: bpy.types.Material,
    *,
    max_tris: int | None = None,
) -> bpy.types.Object:
    """Mesh a distance field (surface nets, then vertices pulled onto the exact surface)."""
    verts, quads = sdf.surface_nets(field, bounds[0], bounds[1], step)
    verts = sdf.project(field, verts, step)
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts.tolist(), [], quads.tolist())
    mesh.validate()
    obj = link(bpy.data.objects.new(name, mesh))
    if max_tris is not None:
        decimate(obj, max_tris)
    obj.data.shade_smooth()
    obj.data.materials.append(material)
    return obj


def field_normals(obj: bpy.types.Object, field: sdf.Field, keep: Iterable[int] = ()) -> None:
    """Shade ``obj`` with the exact normals of the field it was meshed from,
    so a coarse mesh still looks perfectly smooth, including across cut lines.
    Vertices in ``keep`` (e.g. flat caps added later) use their faces' normal."""
    mesh = obj.data
    co = np.array([v.co[:] for v in mesh.vertices])
    g = sdf.gradient(field, co, 1e-4)
    g /= np.maximum(np.linalg.norm(g, axis=1, keepdims=True), 1e-12)
    keep = set(keep)
    if keep:
        flat = np.zeros_like(g)
        for poly in mesh.polygons:
            for vi in poly.vertices:
                if vi in keep:
                    flat[vi] += np.array(poly.normal[:]) * poly.area
        for vi in keep:
            length = np.linalg.norm(flat[vi])
            if length > 0:
                g[vi] = flat[vi] / length
    mesh.normals_split_custom_set_from_vertices(g.tolist())


def triangle_count(obj: bpy.types.Object) -> int:
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def apply_modifiers(obj: bpy.types.Object) -> None:
    depsgraph = bpy.context.evaluated_depsgraph_get()
    baked = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph))
    old = obj.data
    obj.modifiers.clear()
    obj.data = baked
    bpy.data.meshes.remove(old)
    baked.name = obj.name


def decimate(obj: bpy.types.Object, max_tris: int) -> None:
    tris = triangle_count(obj)
    if tris <= max_tris:
        return
    mod = obj.modifiers.new("decimate", "DECIMATE")
    mod.ratio = max_tris / tris
    apply_modifiers(obj)


# --------------------------------------------------------------------------
# Simple primitives
# --------------------------------------------------------------------------


def tube(
    name: str,
    points: list[Vec3],
    radius: float,
    material: bpy.types.Material,
    *,
    sides: int = 10,
) -> bpy.types.Object:
    """A round tube along a polyline, e.g. an antenna stalk."""
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.bevel_mode = "ROUND"
    curve.bevel_depth = radius
    curve.bevel_resolution = max(1, sides // 4)
    curve.use_fill_caps = True
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for p, co in zip(spline.points, points):
        p.co = (*co, 1.0)
    holder = link(bpy.data.objects.new(f"{name}_curve", curve))
    depsgraph = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(holder.evaluated_get(depsgraph))
    bpy.data.objects.remove(holder)
    bpy.data.curves.remove(curve)
    mesh.name = name
    obj = link(bpy.data.objects.new(name, mesh))
    obj.data.shade_smooth()
    obj.data.materials.append(material)
    return obj


# --------------------------------------------------------------------------
# Decals
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class AtlasCell:
    """A pixel rectangle of the face atlas, origin top-left."""

    x: int
    y: int
    w: int
    h: int


@dataclass(frozen=True)
class Patch:
    """A picture lying on a surface: quads with per-corner UVs. ``verts`` are
    on the skin and ``normals`` point outwards from it, one per vertex.
    ``offsets`` is (lift when shown, depth when hidden); None uses the
    picture defaults, SHOW_LIFT and HIDE_DEPTH."""

    verts: list[Vector]
    normals: list[Vector]
    faces: list[tuple[int, int, int, int]]
    uvs: list[tuple[tuple[float, float], ...]]
    offsets: tuple[float, float] | None = None


class Surface:
    """Ray queries against the evaluated surfaces of ``targets``, in world space."""

    def __init__(self, targets: list[bpy.types.Object]) -> None:
        depsgraph = bpy.context.evaluated_depsgraph_get()
        self._trees = [
            (BVHTree.FromObject(o, depsgraph), o.matrix_world.copy(), o.matrix_world.inverted()) for o in targets
        ]

    def cast(self, origin: Vector, direction: Vector, distance: float) -> tuple[Vector, Vector] | None:
        """The first hit along the ray as (point, outward normal), or None."""
        best: tuple[float, Vector, Vector] | None = None
        for tree, to_world, to_local in self._trees:
            local_dir = to_local.to_3x3() @ direction.normalized()
            scale = local_dir.length
            hit, normal, _index, dist = tree.ray_cast(to_local @ origin, local_dir.normalized(), distance * scale)
            if hit is not None and (best is None or dist / scale < best[0]):
                best = (dist / scale, to_world @ hit, (to_local.transposed().to_3x3() @ normal).normalized())
        return None if best is None else (best[1], best[2])


def decal_patch(
    target: bpy.types.Object,
    center: Vec3,
    normal: Vec3,
    size: tuple[float, float],
    cell: AtlasCell,
    atlas_size: tuple[int, int],
    *,
    forward: Vec3 = (0.0, -1.0, 0.0),
    segments: int = 8,
    reach: float = 0.05,
) -> Patch:
    """A grid showing one atlas cell, projected onto ``target`` along ``normal``.

    The cell's +u always runs towards ``forward`` (the beak), so artwork is
    drawn once and mirrors itself on the other side of the head. Grid points
    whose ray misses the surface within ``reach`` are dropped with their quads.
    """
    n = Vector(normal).normalized()
    up = Vector((0.0, 0.0, 1.0))
    v_axis = (up - n * n.dot(up)).normalized()
    u_axis = v_axis.cross(n)  # right-handed: u × v = n
    mirror = u_axis.dot(Vector(forward)) < 0
    surface = Surface([target])

    aw, ah = atlas_size
    width, height = size
    grid = [
        [
            surface.cast(
                Vector(center) + u_axis * ((i / segments - 0.5) * width) + v_axis * ((j / segments - 0.5) * height) + n * reach,
                -n,
                reach * 2,
            )
            for j in range(segments + 1)
        ]
        for i in range(segments + 1)
    ]
    index: dict[tuple[int, int], int] = {}
    verts: list[Vector] = []
    normals: list[Vector] = []
    faces: list[tuple[int, int, int, int]] = []
    uvs: list[tuple[tuple[float, float], ...]] = []
    for i in range(segments):
        for j in range(segments):
            corners = ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1))
            if any(grid[a][b] is None for a, b in corners):
                continue
            for c in corners:
                if c not in index:
                    index[c] = len(verts)
                    point, point_normal = grid[c[0]][c[1]]
                    verts.append(point)
                    normals.append(point_normal)
            faces.append(tuple(index[c] for c in corners))
            uvs.append(
                tuple(
                    (
                        (cell.x + ((1.0 - a / segments) if mirror else a / segments) * cell.w) / aw,
                        1.0 - (cell.y + (1.0 - b / segments) * cell.h) / ah,
                    )
                    for a, b in corners
                )
            )
    return Patch(verts, normals, faces, uvs)


def decal_mesh(name: str, patch: Patch, material: bpy.types.Material, *, lift: float = 0.0008) -> bpy.types.Object:
    """A static picture (no states), floating ``lift`` above the surface it was projected onto."""
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([v + n * lift for v, n in zip(patch.verts, patch.normals)], [], patch.faces)
    uv_layer = mesh.uv_layers.new(name="UVMap")
    for poly, corners in zip(mesh.polygons, patch.uvs):
        for loop_index, uv in zip(poly.loop_indices, corners):
            uv_layer.data[loop_index].uv = uv
    mesh.shade_smooth()
    mesh.materials.append(material)
    return link(bpy.data.objects.new(name, mesh))


# A shown picture floats just above the skin; a hidden one waits, full size,
# just under it. Switching lifts one out and sinks the other, and because the
# lift is larger than the depth, both are out during the middle of a blend:
# the outgoing picture until w = SHOW / (SHOW + HIDE), the incoming one from
# w = HIDE / (SHOW + HIDE). Nothing shrinks, so nothing can vanish mid-blend.
# Kept small: a lifted picture near the head's outline peeks over it from the side.
SHOW_LIFT = 0.0014
HIDE_DEPTH = 0.0006
# Painted strokes are thin and, in some poses, lie right along the head's
# outline, where even a small lift shows as a sliver past it. They sit closer
# to the skin; the overlap still holds (outgoing until w = 0.71, incoming from
# w = 0.29), so a 50/50 blend leaves a stroke 0.18 mm above the skin.
STROKE_SHOW_LIFT = 0.0006
STROKE_HIDE_DEPTH = 0.00025


def face_mesh(
    name: str,
    patches: list[tuple[str, str, Patch]],
    defaults: dict[str, str],
    material: bpy.types.Material,
) -> bpy.types.Object:
    """Every face state in one mesh, switched with morph targets.

    ``patches`` are (part, state, patch). The base shape shows each part's
    default state; every other state is a morph target ``<part>_<state>`` that
    lifts its pictures out of the skin and sinks the part's default ones.
    """
    shown: list[Vector] = []
    hidden: list[Vector] = []
    owner: list[tuple[str, str]] = []
    faces: list[tuple[int, ...]] = []
    face_uvs: list[tuple[tuple[float, float], ...]] = []
    for part, state, patch in patches:
        start = len(shown)
        lift, depth = patch.offsets or (SHOW_LIFT, HIDE_DEPTH)
        for v, n in zip(patch.verts, patch.normals):
            shown.append(v + n * lift)
            hidden.append(v - n * depth)
            owner.append((part, state))
        faces.extend(tuple(start + i for i in f) for f in patch.faces)
        face_uvs.extend(patch.uvs)

    base = [s if defaults[o[0]] == o[1] else h for s, h, o in zip(shown, hidden, owner)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(base, [], faces)
    uv_layer = mesh.uv_layers.new(name="UVMap")
    for poly, corners in zip(mesh.polygons, face_uvs):
        for loop_index, uv in zip(poly.loop_indices, corners):
            uv_layer.data[loop_index].uv = uv
    mesh.shade_smooth()
    mesh.materials.append(material)
    obj = link(bpy.data.objects.new(name, mesh))

    obj.shape_key_add(name="Basis", from_mix=False)
    for part, state in dict.fromkeys(o for o in owner if defaults[o[0]] != o[1]):
        key = obj.shape_key_add(name=f"{part}_{state}", from_mix=False)
        for i, o in enumerate(owner):
            if o == (part, state):
                key.data[i].co = shown[i]
            elif o == (part, defaults[part]):
                key.data[i].co = hidden[i]
    return obj


# --------------------------------------------------------------------------
# Painted regions
# --------------------------------------------------------------------------


def ellipsoid_field(b: Blob) -> Callable[[Vector], float]:
    """Negative inside the ellipsoid ``b`` (its visible radii), positive outside."""
    radii = (b.radii,) * 3 if isinstance(b.radii, (int, float)) else b.radii
    to_local = Euler([math.radians(a) for a in b.rot]).to_matrix().transposed()
    center = Vector(b.at)

    def field(co: Vector) -> float:
        p = to_local @ (Vector(co) - center)
        return sum((c / r) ** 2 for c, r in zip(p, radii)) - 1.0

    return field


def cut_contour(bm: bmesh.types.BMesh, field: Callable[[Vector], float]) -> set[bmesh.types.BMEdge]:
    """Cut ``bm`` along the zero contour of ``field`` and return the contour edges."""
    eps = 1e-7
    value = {v: field(v.co) for v in bm.verts}
    on_contour = {v for v, f in value.items() if abs(f) < eps}
    for edge in list(bm.edges):
        a, b = edge.verts
        fa, fb = value[a], value[b]
        if abs(fa) < eps or abs(fb) < eps:
            continue
        if (fa < 0) != (fb < 0):
            _, v = bmesh.utils.edge_split(edge, a, fa / (fa - fb))
            on_contour.add(v)
    edges: set[bmesh.types.BMEdge] = set()
    for face in list(bm.faces):
        ends = [v for v in face.verts if v in on_contour]
        if len(ends) != 2:
            continue
        existing = bm.edges.get(ends)
        if existing is not None:
            edges.add(existing)
        else:
            edges.update(bmesh.ops.connect_verts(bm, verts=ends)["edges"])
    return edges


def cut(obj: bpy.types.Object, *fields: Callable[[Vector], float], mark: bool = False) -> None:
    """Cut ``obj`` along the zero contour of each field in turn (geometry is
    unchanged). Cutting nearby contours one at a time keeps every face split
    cleanly, where a single combined field would skip faces crossed twice.
    With ``mark``, the contour edges are flagged as seams (for ``tear_open``)."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    for field in fields:
        for edge in cut_contour(bm, field):
            edge.seam = edge.seam or mark
    bm.to_mesh(obj.data)
    bm.free()


def paint_region(obj: bpy.types.Object, field: Callable[[Vector], float], material: bpy.types.Material) -> None:
    """Colour the part of ``obj`` where ``field`` < 0 with ``material``.

    The surface is cut exactly along the field's zero contour, so the patch has
    a smooth edge but stays flush with the surface and shares its normals.
    """
    obj.data.materials.append(material)
    slot = len(obj.data.materials) - 1
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    cut_contour(bm, field)
    for face in bm.faces:
        if field(face.calc_center_median()) < 0:
            face.material_index = slot
    bm.to_mesh(obj.data)
    bm.free()


@dataclass
class Tear:
    """Vertex indices of a torn, capped opening (see ``tear_open``)."""

    upper: list[int]  # skin along the upper lip
    lower: list[int]  # skin along the lower lip
    corners: list[int]  # the two ends, shared by both lips
    roof: list[int]  # the upper cap along the upper lip
    floor: list[int]  # the lower cap along the lower lip
    hinge: list[int]  # both caps where they meet across the back (incl. their corner copies)


def _chain(edges: list[bmesh.types.BMEdge]) -> list[bmesh.types.BMVert]:
    """Order connected edges into one path of vertices, end to end."""
    links: dict[bmesh.types.BMVert, list[bmesh.types.BMVert]] = {}
    for e in edges:
        a, b = e.verts
        links.setdefault(a, []).append(b)
        links.setdefault(b, []).append(a)
    ends = [v for v, n in links.items() if len(n) == 1]
    if len(ends) != 2 or any(len(n) > 2 for n in links.values()):
        where = ", ".join(f"({v.co.x:+.3f} {v.co.y:+.3f} {v.co.z:.3f})" for v in ends)
        branch = [v for v, n in links.items() if len(n) > 2]
        raise ValueError(f"tear lip is not a single path: {len(ends)} ends at {where}; {len(branch)} branch points")
    path, prev = [ends[0]], None
    while len(path) < len(links):
        nxt = next(v for v in links[path[-1]] if v is not prev)
        prev = path[-1]
        path.append(nxt)
    return path


def tear_open(
    obj: bpy.types.Object,
    seam: Callable[[Vector], float],
    rip: Callable[[Vector], bool],
    slot: int,
    *,
    hinge_points: int = 6,
) -> Tear:
    """Tear ``obj`` open along the edges a marked ``cut`` made along the zero
    contour of ``seam``, wherever ``rip(midpoint)`` holds, and close both sides
    with flat caps in material ``slot``: a roof under the upper lip and a floor
    on the lower lip, meeting on a straight hinge across the back between the
    tear's two ends. (``seam`` is positive on the upper side.)

    The skin keeps its shape; opened, the gap between roof and floor is empty,
    so an open mouth can be looked through from the side while its inside
    never shows the hollow of the head.
    """
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    torn = [e for e in bm.edges if e.seam and len(e.link_faces) == 2 and rip((e.verts[0].co + e.verts[1].co) / 2)]
    if not torn:
        raise ValueError("nothing to tear")
    for e in bm.edges:
        e.seam = False
    bmesh.ops.split_edges(bm, edges=torn)
    lips = [e for e in bm.edges if len(e.link_faces) == 1]
    upper = [e for e in lips if seam(e.link_faces[0].calc_center_median()) > 0]
    lower = [e for e in lips if seam(e.link_faces[0].calc_center_median()) <= 0]
    up, low = _chain(upper), _chain(lower)
    if {up[0], up[-1]} != {low[0], low[-1]}:
        raise ValueError("the tear's lips do not meet at the same two ends")
    # both lips run from the +x end to the -x end
    if up[0].co.x < up[-1].co.x:
        up.reverse()
    if low[0].co.x < low[-1].co.x:
        low.reverse()
    start, end = up[0].co.copy(), up[-1].co.copy()
    hinge_co = [end + (start - end) * (i / hinge_points) for i in range(1, hinge_points)]

    def cap(lip: list[bmesh.types.BMVert], facing: float) -> tuple[list, list]:
        """Fill the lip (as copies) plus the hinge; faces point along z * facing."""
        ring = [bm.verts.new(v.co) for v in lip] + [bm.verts.new(c) for c in hinge_co]
        ring_edges = [bm.edges.new((ring[i], ring[(i + 1) % len(ring)])) for i in range(len(ring))]
        filled = bmesh.ops.triangle_fill(bm, use_beauty=True, use_dissolve=False, edges=ring_edges)
        faces = [g for g in filled["geom"] if isinstance(g, bmesh.types.BMFace)]
        bm.normal_update()
        flip = [f for f in faces if f.normal.z * facing < 0]
        if flip:
            bmesh.ops.reverse_faces(bm, faces=flip)
        for f in faces:
            f.material_index = slot
            f.smooth = True
        return ring[1 : len(lip) - 1], [ring[0], ring[len(lip) - 1], *ring[len(lip) :]]

    roof, roof_hinge = cap(up, -1.0)
    floor, floor_hinge = cap(low, 1.0)
    bm.verts.index_update()
    tear = Tear(
        upper=[v.index for v in up[1:-1]],
        lower=[v.index for v in low[1:-1]],
        corners=[up[0].index, up[-1].index],
        roof=[v.index for v in roof],
        floor=[v.index for v in floor],
        hinge=[v.index for v in roof_hinge + floor_hinge],
    )
    bm.to_mesh(obj.data)
    bm.free()
    return tear


# --------------------------------------------------------------------------
# Curves on surfaces
# --------------------------------------------------------------------------


def piecewise(points: list[tuple[float, float]]) -> Callable[[float], float]:
    """Linear interpolation through (x, y) points sorted by x, clamped at the ends."""

    def f(x: float) -> float:
        if x <= points[0][0]:
            return points[0][1]
        for (x0, y0), (x1, y1) in zip(points, points[1:]):
            if x <= x1:
                return y0 + (y1 - y0) * (x - x0) / (x1 - x0)
        return points[-1][1]

    return f


def resample(points: list[tuple[float, float]], n: int) -> list[tuple[float, float]]:
    """``n`` points spaced evenly along a 2D polyline."""
    lengths = [0.0]
    for (ax, ay), (bx, by) in zip(points, points[1:]):
        lengths.append(lengths[-1] + math.hypot(bx - ax, by - ay))
    out = []
    for k in range(n):
        target = lengths[-1] * k / (n - 1)
        i = max(0, min(len(points) - 2, next((j for j in range(len(lengths) - 1) if lengths[j + 1] >= target), len(points) - 2)))
        seg = lengths[i + 1] - lengths[i]
        t = 0.0 if seg == 0 else (target - lengths[i]) / seg
        (ax, ay), (bx, by) = points[i], points[i + 1]
        out.append((ax + (bx - ax) * t, ay + (by - ay) * t))
    return out


def surface_stroke(
    targets: list[bpy.types.Object],
    side_view: list[tuple[float, float]],
    side: float,
    width: float,
    cell: AtlasCell,
    atlas_size: tuple[int, int],
    *,
    reach: float = 0.02,
) -> Patch:
    """A painted line: the side-view polyline ``side_view`` of (y, z) points is
    projected onto whichever of ``targets`` is outermost on the ``side`` (+1 or
    -1 along X), then widened into a ribbon that tapers at both ends. The
    ribbon's edges are projected onto the surface too, so it hugs creases
    instead of cutting through them. Every corner samples the middle of
    ``cell`` (solid ink in the atlas)."""
    surface = Surface(targets)
    centre = []
    for y, z in side_view:
        hit = surface.cast(Vector((side * 0.5, y, z)), Vector((-side, 0.0, 0.0)), 1.0)
        if hit is None:
            raise ValueError(f"stroke point ({y:.3f}, {z:.3f}) misses the surface")
        centre.append(hit)

    n = len(centre)
    verts: list[Vector] = []
    normals: list[Vector] = []
    for i, (p, normal) in enumerate(centre):
        tangent = (centre[min(i + 1, n - 1)][0] - centre[max(i - 1, 0)][0]).normalized()
        across = normal.cross(tangent).normalized()
        if across.z < 0:
            across = -across
        half = width * (0.5 + 0.5 * min(1.0, i / 3, (n - 1 - i) / 3)) / 2
        for edge in (p + across * half, p - across * half):
            hit = surface.cast(edge + normal * reach, -normal, reach * 2) or (edge, normal)
            verts.append(hit[0])
            normals.append(hit[1])
    faces: list[tuple[int, int, int, int]] = []
    for i in range(n - 1):
        a, b, c, d = 2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2
        facing = (verts[b] - verts[a]).cross(verts[d] - verts[a]).dot(centre[i][1])
        faces.append((a, b, c, d) if facing > 0 else (a, d, c, b))
    aw, ah = atlas_size
    ink = ((cell.x + cell.w / 2) / aw, 1.0 - (cell.y + cell.h / 2) / ah)
    return Patch(verts, normals, faces, [(ink,) * 4 for _ in faces], (STROKE_SHOW_LIFT, STROKE_HIDE_DEPTH))


# --------------------------------------------------------------------------
# Rig
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class Bone:
    name: str
    head: Vec3
    parent: str | None
    length: float = 0.05


def armature(name: str, bones: Iterable[Bone]) -> bpy.types.Object:
    data = bpy.data.armatures.new(name)
    arm = link(bpy.data.objects.new(name, data))
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    for b in bones:
        eb = data.edit_bones.new(b.name)
        eb.head = b.head
        eb.tail = (b.head[0], b.head[1], b.head[2] + b.length)
        eb.roll = 0.0
        if b.parent:
            eb.parent = data.edit_bones[b.parent]
            eb.use_connect = False
    bpy.ops.object.mode_set(mode="OBJECT")
    return arm


def attach(obj: bpy.types.Object, arm: bpy.types.Object, bone: str) -> None:
    """Parent ``obj`` rigidly to ``bone`` without moving it."""
    bpy.context.view_layer.update()  # matrix_world is stale right after setting location
    world = obj.matrix_world.copy()
    obj.parent = arm
    obj.parent_type = "BONE"
    obj.parent_bone = bone
    bpy.context.view_layer.update()
    obj.matrix_world = world


def skin(
    obj: bpy.types.Object,
    arm: bpy.types.Object,
    weights: Callable[[bpy.types.MeshVertex], dict[str, float]],
) -> None:
    """Bind ``obj`` to ``arm`` with per-vertex weights from ``weights(vertex)``."""
    groups: dict[str, bpy.types.VertexGroup] = {}
    for v in obj.data.vertices:
        w = {bone: value for bone, value in weights(v).items() if value > 1e-4}
        total = sum(w.values())
        for bone, value in w.items():
            if bone not in groups:
                groups[bone] = obj.vertex_groups.new(name=bone)
            groups[bone].add([v.index], value / total, "REPLACE")
    mod = obj.modifiers.new("rig", "ARMATURE")
    mod.object = arm
    obj.parent = arm


def socket(name: str, arm: bpy.types.Object, bone: str, at: Vec3) -> bpy.types.Object:
    """An empty accessories attach to; follows ``bone``."""
    empty = link(bpy.data.objects.new(name, None))
    empty.empty_display_type = "ARROWS"
    empty.empty_display_size = 0.04
    empty.location = at
    attach(empty, arm, bone)
    return empty


def smoothstep(edge0: float, edge1: float, x: float) -> float:
    t = min(1.0, max(0.0, (x - edge0) / (edge1 - edge0)))
    return t * t * (3.0 - 2.0 * t)


# --------------------------------------------------------------------------
# Animation
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class Key:
    """A pose-bone keyframe: rotation as XYZ Euler degrees, location in the
    bone's rest frame (for these upright bones: x = left, y = up, z = forward).
    """

    frame: int
    rot: Vec3 = (0.0, 0.0, 0.0)
    loc: Vec3 = (0.0, 0.0, 0.0)


def clip(
    arm: bpy.types.Object,
    name: str,
    frames: int,
    tracks: dict[str, list[Key]],
) -> bpy.types.Action:
    """Key one action. Every listed bone gets rotation and location channels
    so clips cross-fade cleanly."""
    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    action.use_frame_range = True
    action.frame_start = 0
    action.frame_end = frames
    if arm.animation_data is None:
        arm.animation_data_create()
    arm.animation_data.action = action

    for bone_name, keys in tracks.items():
        pb = arm.pose.bones[bone_name]
        pb.rotation_mode = "QUATERNION"
        for key in keys:
            pb.rotation_quaternion = Euler([math.radians(a) for a in key.rot]).to_quaternion()
            pb.location = key.loc
            pb.keyframe_insert("rotation_quaternion", frame=key.frame, group=bone_name)
            pb.keyframe_insert("location", frame=key.frame, group=bone_name)
    rest_pose(arm)
    return action


def shape_clip(
    obj: bpy.types.Object,
    name: str,
    frames: int,
    keys: dict[str, list[tuple[int, float]]],
) -> bpy.types.Action:
    """Key morph-target weights: ``keys`` maps shape key name to (frame, value)."""
    shape_keys = obj.data.shape_keys
    if shape_keys.animation_data is None:
        shape_keys.animation_data_create()
    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    action.use_frame_range = True
    action.frame_start = 0
    action.frame_end = frames
    shape_keys.animation_data.action = action
    for key_name, points in keys.items():
        block = shape_keys.key_blocks[key_name]
        for frame, value in points:
            block.value = value
            block.keyframe_insert("value", frame=frame)
    for block in shape_keys.key_blocks:
        block.value = 0.0
    return action


def push_to_nla(id_data: bpy.types.ID, track: str) -> None:
    """Move the assigned action onto an NLA track named ``track``.

    The glTF exporter's NLA mode merges same-named tracks of different data
    blocks into one animation; that is how bone and morph channels share a clip.
    """
    anim = id_data.animation_data
    action = anim.action
    anim.nla_tracks.new().name = track
    anim.nla_tracks[-1].strips.new(track, int(action.frame_start), action)
    anim.action = None


def rest_pose(arm: bpy.types.Object) -> None:
    for pb in arm.pose.bones:
        pb.rotation_quaternion = (1.0, 0.0, 0.0, 0.0)
        pb.location = (0.0, 0.0, 0.0)
        pb.scale = (1.0, 1.0, 1.0)
