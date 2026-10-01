import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { characterMaterial, isDecalMaterial } from "./toon-materials";

function gltfMaterial(extras: Record<string, unknown>): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ color: 0x78b4d8 });
  material.userData = extras;
  return material;
}

describe("characterMaterial", () => {
  it("keeps a decal recognisable as a decal, so the face gets no outlines", () => {
    const display = characterMaterial(gltfMaterial({ unlit: true }));
    expect(isDecalMaterial(display)).toBe(true);
  });

  it("toon-shades everything else, with its shade colour", () => {
    const display = characterMaterial(gltfMaterial({ shade_color: "#5f93bd" }));
    expect(isDecalMaterial(display)).toBe(false);
    expect(display).toBeInstanceOf(THREE.ShaderMaterial);
  });
});
