import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { ACCESSORIES, CHARACTER_MODELS, COLOR_SWATCHES } from "./character-catalog";
import { parseCharacterFile } from "./character-files";

// Tripwire: the catalog describes the shipped files, so it must agree with them.
const REPO = fileURLToPath(new URL("../../../", import.meta.url));

function bytesOf(path: string): ArrayBuffer {
  const file = readFileSync(REPO + path);
  return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
}

describe.each(Object.values(CHARACTER_MODELS))("catalog model $id", (model) => {
  it("matches its .glb: bones, face states, customizable materials", async () => {
    const file = await parseCharacterFile(bytesOf(`clients/web/public/characters/${model.file}`));
    const manifest = JSON.parse(file.scene.userData.character as string) as {
      face: { eyes: string[]; mouth: string[] };
    };
    const bones = new Set<string>();
    const materials = new Set<string>();
    file.scene.traverse((obj) => {
      if (obj instanceof THREE.Bone) bones.add(obj.name.replace(/_\d+$/, ""));
      if (obj instanceof THREE.Mesh) {
        for (const mat of Array.isArray(obj.material) ? obj.material : [obj.material]) materials.add(mat.name);
      }
    });
    expect([...bones].sort()).toEqual([...model.bones].sort());
    expect(manifest.face.eyes).toEqual([...model.face.eyes]);
    expect(manifest.face.mouth).toEqual([...model.face.mouth]);
    for (const part of model.customizable) expect(materials, part.material).toContain(part.material);
  });
});

describe("accessories", () => {
  it("each declare the socket their file says", async () => {
    for (const accessory of Object.values(ACCESSORIES)) {
      const file = await parseCharacterFile(bytesOf(`clients/web/public/characters/${accessory.file}`));
      const meta = JSON.parse(file.scene.userData.accessory as string) as { socket: string; name: string };
      expect(meta.socket, accessory.name).toBe(accessory.socket);
    }
  });
});

describe("color swatches", () => {
  it("are distinct lowercase hex pairs", () => {
    const bases = COLOR_SWATCHES.map((s) => s.base);
    expect(new Set(bases).size).toBe(bases.length);
    for (const swatch of COLOR_SWATCHES) {
      expect(swatch.base).toMatch(/^#[0-9a-f]{6}$/);
      expect(swatch.shade).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
