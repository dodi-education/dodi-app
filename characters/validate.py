"""Check a character or accessory .glb against the format (see README.md).

    python3 characters/validate.py characters/dodi/dodi.glb
    python3 characters/validate.py characters/accessories/headphones/headphones.glb

Plain Python, no dependencies: reads the glTF JSON chunk and checks the
conventions the runtime relies on. Exits non-zero when anything required is
missing. This is the reference for the upload validator the app will need.
"""

from __future__ import annotations

import json
import struct
import sys
from pathlib import Path

REQUIRED_BONES = ("root", "body", "neck", "head")
KNOWN_SOCKETS = ("socket_head_top", "socket_eyes", "socket_ears", "socket_neck", "socket_back")
MAX_TRIANGLES = 20_000
MAX_BYTES = 3 * 1024 * 1024
MAX_TEXTURE = 1024
# Accessories are small props that ride on a character's socket.
ACCESSORY_MAX_TRIANGLES = 8_000
ACCESSORY_MAX_BYTES = 1024 * 1024
ACCESSORY_MAX_TEXTURE = 512


def read_glb(path: Path) -> tuple[dict, bytes]:
    data = path.read_bytes()
    magic, version, length = struct.unpack_from("<III", data, 0)
    if magic != 0x46546C67 or version != 2:
        raise ValueError("not a glTF 2.0 binary (.glb)")
    json_len, json_type = struct.unpack_from("<II", data, 12)
    if json_type != 0x4E4F534A:
        raise ValueError("first chunk is not JSON")
    doc = json.loads(data[20 : 20 + json_len])
    return doc, data


def png_size(blob: bytes) -> tuple[int, int] | None:
    if blob[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    return struct.unpack(">II", blob[16:24])


def triangle_count(doc: dict) -> int:
    accessors = doc.get("accessors", [])
    count = 0
    for mesh in doc.get("meshes", []):
        for prim in mesh["primitives"]:
            if prim.get("mode", 4) == 4 and "indices" in prim:
                count += accessors[prim["indices"]]["count"] // 3
    return count


def oversized_images(doc: dict, raw: bytes, limit: int) -> list[str]:
    bin_start = 20 + struct.unpack_from("<I", raw, 12)[0] + 8
    problems = []
    for img in doc.get("images", []):
        view = doc["bufferViews"][img["bufferView"]]
        start = bin_start + view.get("byteOffset", 0)
        dims = png_size(raw[start : start + 32])
        if dims and max(dims) > limit:
            problems.append(f"image '{img.get('name')}' is {dims[0]}x{dims[1]}, over {limit}px")
    return problems


def material_warnings(doc: dict) -> list[str]:
    return [
        f"material '{m.get('name')}' has no shade_color (renderer will derive one)"
        for m in doc.get("materials", [])
        if not m.get("extras", {}).get("unlit") and "shade_color" not in m.get("extras", {})
    ]


def report(path: Path, summary: str, warnings: list[str], errors: list[str]) -> int:
    print(f"{path.name}: {summary}")
    for w in warnings:
        print(f"  warning: {w}")
    for e in errors:
        print(f"  error: {e}")
    print("  OK" if not errors else f"  {len(errors)} error(s)")
    return 1 if errors else 0


def check_accessory(path: Path, doc: dict, raw: bytes, manifest: dict) -> int:
    """An accessory: one static prop whose origin, the ``attach`` node, goes on a socket."""
    errors: list[str] = []
    warnings: list[str] = material_warnings(doc)
    nodes = doc.get("nodes", [])
    if manifest.get("format") != "accessory":
        errors.append('the "accessory" manifest has no format "accessory"')
    if manifest.get("socket") not in KNOWN_SOCKETS:
        errors.append(f"socket '{manifest.get('socket')}' is not one of {', '.join(KNOWN_SOCKETS)}")
    attach = next((n for n in nodes if n.get("name") == "attach"), None)
    if attach is None:
        errors.append("no 'attach' node (the point that goes on the socket)")
    else:
        moved = any(abs(v) > 1e-5 for v in attach.get("translation", [0, 0, 0]))
        turned = any(abs(a - b) > 1e-5 for a, b in zip(attach.get("rotation", [0, 0, 0, 1]), (0, 0, 0, 1)))
        if moved or turned or "matrix" in attach:
            errors.append("'attach' must sit at the accessory's origin with no rotation")
    if doc.get("skins") or doc.get("animations"):
        warnings.append("accessories are static in format v1; skins and animations are ignored")
    triangles = triangle_count(doc)
    if triangles > ACCESSORY_MAX_TRIANGLES:
        errors.append(f"{triangles} triangles exceeds the accessory budget of {ACCESSORY_MAX_TRIANGLES}")
    size = path.stat().st_size
    if size > ACCESSORY_MAX_BYTES:
        errors.append(f"file is {size / 1024:.0f} KB, over the accessory budget of {ACCESSORY_MAX_BYTES // 1024} KB")
    errors += oversized_images(doc, raw, ACCESSORY_MAX_TEXTURE)
    summary = f"accessory '{manifest.get('name')}' on {manifest.get('socket')}, {size / 1024:.0f} KB, {triangles} triangles"
    return report(path, summary, warnings, errors)


def main(path: Path) -> int:
    doc, raw = read_glb(path)
    errors: list[str] = []
    warnings: list[str] = []
    nodes = doc.get("nodes", [])
    names = {n.get("name", ""): i for i, n in enumerate(nodes)}
    parent = {c: i for i, n in enumerate(nodes) for c in n.get("children", [])}

    # Manifest
    scene = doc["scenes"][doc.get("scene", 0)]
    raw_accessory = scene.get("extras", {}).get("accessory")
    if raw_accessory is not None:
        accessory = json.loads(raw_accessory) if isinstance(raw_accessory, str) else raw_accessory
        return check_accessory(path, doc, raw, accessory if isinstance(accessory, dict) else {})
    raw_manifest = scene.get("extras", {}).get("character")
    manifest = json.loads(raw_manifest) if isinstance(raw_manifest, str) else raw_manifest
    if not isinstance(manifest, dict) or manifest.get("format") != "character":
        errors.append('scene extras lack the "character" manifest')
        manifest = {}

    # Skeleton
    skins = doc.get("skins", [])
    joints = {nodes[j]["name"] for s in skins for j in s["joints"]}
    bone_nodes = {name for name in names if name in joints}
    for bone in REQUIRED_BONES:
        if bone not in names:
            errors.append(f"missing required bone '{bone}'")
    for i in (s for skin in skins for s in skin["joints"]):
        rot = nodes[i].get("rotation")
        if rot and any(abs(a - b) > 1e-4 for a, b in zip(rot, (0, 0, 0, 1))):
            warnings.append(f"bone '{nodes[i]['name']}' has a non-identity rest rotation")

    # Sockets must hang off a bone so accessories follow the animation.
    sockets = [n for n in names if n.startswith("socket_")]
    for s in sockets:
        p = parent.get(names[s])
        if p is None or nodes[p].get("name") not in bone_nodes:
            errors.append(f"socket '{s}' is not parented to a bone")
        if s not in KNOWN_SOCKETS:
            warnings.append(f"unknown socket '{s}'")
    for s in manifest.get("sockets", []):
        if s not in names:
            errors.append(f"manifest lists socket '{s}' but no node has that name")

    # Face states: the default is the base shape, every other state a morph
    # target "<part>_<state>" on the face mesh.
    face = manifest.get("face", {})
    targets = {t for m in doc.get("meshes", []) for t in (m.get("extras") or {}).get("targetNames", [])}
    for part in ("eyes", "mouth"):
        states = face.get(part, [])
        default = face.get("default", {}).get(part)
        if states and default not in states:
            errors.append(f"default {part} state '{default}' is not listed")
        for state in states:
            if state != default and f"{part}_{state}" not in targets:
                errors.append(f"face state {part}/{state} has no morph target '{part}_{state}'")
    for m in doc.get("meshes", []):
        if any(w != 0 for w in m.get("weights", [])):
            errors.append(f"mesh '{m.get('name')}' has non-zero default morph weights; the rest face must be the default")

    # Clips
    clips = [a.get("name", "") for a in doc.get("animations", [])]
    if "idle" not in clips:
        errors.append("no 'idle' animation")
    for anim in doc.get("animations", []):
        if targets and not any(c["target"]["path"] == "weights" for c in anim["channels"]):
            warnings.append(f"clip '{anim.get('name')}' does not set the facial expression")
    for c in manifest.get("clips", []):
        if c not in clips:
            errors.append(f"manifest lists clip '{c}' but the file has no such animation")
    jaw = manifest.get("jaw", {}).get("bone")
    if jaw and jaw not in names:
        errors.append(f"jaw bone '{jaw}' not found")
    for spring in manifest.get("springs", []):
        if spring not in names:
            errors.append(f"spring bone '{spring}' not found")

    # Materials and budgets
    warnings += material_warnings(doc)
    triangles = triangle_count(doc)
    if triangles > MAX_TRIANGLES:
        errors.append(f"{triangles} triangles exceeds the {MAX_TRIANGLES} budget")
    size = path.stat().st_size
    if size > MAX_BYTES:
        errors.append(f"file is {size / 1e6:.1f} MB, over the {MAX_BYTES / 1e6:.0f} MB budget")
    errors += oversized_images(doc, raw, MAX_TEXTURE)

    summary = (f"{size / 1024:.0f} KB, {triangles} triangles, {len(bone_nodes)} bones, "
               f"{len(sockets)} sockets, clips: {', '.join(clips)}")
    if face:
        summary += f"\n  face: eyes {face.get('eyes')}, mouth {face.get('mouth')}"
    return report(path, summary, warnings, errors)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    sys.exit(main(Path(sys.argv[1])))
