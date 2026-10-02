import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { beforeAll, describe, expect, it } from "vitest";

import { ACCESSORY_NAMES, parseCharacterFile, type CharacterFile } from "./character-files";
import { characterPoseFor, IDLE_POSE } from "./character-pose";
import { CharacterStage } from "./character-stage";
import { isOutlineHull } from "./hull-outline";

// The runtime files as the pipeline builds them (characters/README.md), and the
// copies the clients ship.
const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const SOURCES = {
  character: "characters/dodi/dodi.glb",
  headphones: "characters/accessories/headphones/headphones.glb",
};
const COPIES = {
  character: ["clients/web/public/characters/dodi.glb", "clients/mobile/assets/characters/dodi.glb"],
  headphones: [
    "clients/web/public/characters/accessories/headphones.glb",
    "clients/mobile/assets/characters/accessories/headphones.glb",
  ],
};

function bytesOf(path: string): ArrayBuffer {
  const file = readFileSync(REPO + path);
  return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
}

let character: CharacterFile;
let headphones: CharacterFile;

beforeAll(async () => {
  character = await parseCharacterFile(bytesOf(SOURCES.character));
  headphones = await parseCharacterFile(bytesOf(SOURCES.headphones));
});

function newStage(): CharacterStage {
  // Fresh files each time: the stage takes ownership of the scenes.
  return new CharacterStage(
    { scene: cloneSkinned(character.scene) as THREE.Group, animations: character.animations },
    new Map([["headphones", { scene: cloneSkinned(headphones.scene) as THREE.Group, animations: [] }]]),
  );
}

function meshNamed(root: THREE.Object3D, name: string): THREE.Mesh | undefined {
  let found: THREE.Mesh | undefined;
  root.traverse((obj) => {
    if (!found && obj instanceof THREE.Mesh && obj.name === name && !isOutlineHull(obj)) found = obj;
  });
  return found;
}

describe("the client copies of the character files", () => {
  it("match what the pipeline built", () => {
    for (const [kind, copies] of Object.entries(COPIES)) {
      const source = Buffer.from(bytesOf(SOURCES[kind as keyof typeof SOURCES]));
      for (const copy of copies) expect(Buffer.from(bytesOf(copy)).equals(source), copy).toBe(true);
    }
  });
});

describe("parseCharacterFile", () => {
  it("reads the character with its clips and its face atlas, decoded in script", () => {
    expect(character.animations.map((clip) => clip.name)).toEqual(
      expect.arrayContaining(["idle", "listen", "think", "talk", "sleep", "deaf"]),
    );
    let atlas: THREE.Texture | null = null;
    character.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshStandardMaterial && obj.material.map) {
        atlas = obj.material.map;
      }
    });
    expect(atlas).toBeInstanceOf(THREE.DataTexture);
    const image = (atlas as THREE.DataTexture | null)?.image;
    expect(image?.width).toBe(1024);
    expect(image?.height).toBe(512);
  });

  it("reads the accessories the app ships", () => {
    expect(ACCESSORY_NAMES).toContain("headphones");
    expect(typeof headphones.scene.userData.accessory).toBe("string");
  });
});

describe("CharacterStage", () => {
  it("builds the scene: toon materials, the accessory on its socket, hidden", () => {
    const stage = newStage();
    expect(stage.clipNames).toContain("idle");
    let toonMeshes = 0;
    stage.character.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.material instanceof THREE.ShaderMaterial) toonMeshes++;
    });
    expect(toonMeshes).toBeGreaterThan(0);
    const band = meshNamed(stage.character, "band") ?? stage.character.getObjectByName("band");
    expect(band).toBeDefined();
  });

  it("plays each state's clip and wears the headphones only while deaf", () => {
    const stage = newStage();
    expect(stage.setPose(IDLE_POSE, false)).toEqual({ clip: "idle", isChanged: true });
    for (const [state, clip] of [
      ["active", "listen"],
      ["sleep", "sleep"],
      ["deaf", "deaf"],
    ] as const) {
      stage.setPose(characterPoseFor({ state, isThinking: false, isSpeaking: false }), false);
      stage.update(0.2);
      expect(stage.currentClip).toBe(clip);
    }
    let headphonesShown = false;
    stage.character.traverse((obj) => {
      if (obj.userData.accessory !== undefined) headphonesShown = obj.visible;
    });
    expect(headphonesShown).toBe(true);
    expect(stage.setPose(characterPoseFor({ state: "deaf", isThinking: false, isSpeaking: false }), false)).toEqual({
      clip: "deaf",
      isChanged: false,
      unchangedBecause: "same-pose",
    });
  });

  it("holds the clip's first frame under reduced motion, and plays on without it", () => {
    const stage = newStage();
    stage.setPose(characterPoseFor({ state: "sleep", isThinking: false, isSpeaking: false }), true);
    const before = JSON.stringify(stage.debugSnapshot());
    stage.update(0.5);
    expect(JSON.stringify(stage.debugSnapshot())).toBe(before);
    expect(stage.debugSnapshot().timeScale).toBe(0);
    stage.setReducedMotion(false);
    expect(stage.debugSnapshot().timeScale).toBe(1);
  });

  it("opens the jaw with the voice while talking", () => {
    let level = 1;
    const stage = new CharacterStage(
      { scene: cloneSkinned(character.scene) as THREE.Group, animations: character.animations },
      new Map(),
      { voiceLevel: () => level },
    );
    const jaw = stage.character.getObjectByName("jaw");
    expect(jaw).toBeInstanceOf(THREE.Bone);
    stage.setPose(characterPoseFor({ state: "active", isThinking: false, isSpeaking: true }), false);
    for (let i = 0; i < 30; i++) stage.update(1 / 60);
    const open = jaw?.quaternion.clone();
    level = 0;
    for (let i = 0; i < 30; i++) stage.update(1 / 60);
    expect(open && jaw ? open.angleTo(jaw.quaternion) : 0).toBeGreaterThan(0.1);
  });

  it("frames the box and finds the character in its middle, not in a corner", () => {
    const stage = newStage();
    stage.setPose(IDLE_POSE, false);
    stage.layout({
      boxWidth: 200,
      boxHeight: 200,
      canvasWidth: 300,
      canvasHeight: 300,
      bufferWidth: 600,
      bufferHeight: 600,
      pixelRatio: 2,
    });
    stage.view.apply(stage.camera, 5);
    stage.camera.updateMatrixWorld();
    expect(stage.camera.top - stage.camera.bottom).toBeCloseTo(1.8); // 1.2 units over 200 of 300 px
    expect(stage.hitTest(0, 0)).toBe(true);
    expect(stage.hitTest(0.95, 0.95)).toBe(false);
  });

  it("builds the hull outline on demand and leaves it out of hit tests", () => {
    const stage = newStage();
    expect(stage.getOutlineMode()).toBe("edges");
    stage.setOutlineMode("hull");
    let hulls = 0;
    stage.character.traverse((obj) => {
      if (isOutlineHull(obj)) {
        hulls++;
        expect(obj.visible).toBe(true);
      }
    });
    expect(hulls).toBeGreaterThan(0);
    stage.setOutlineMode("edges");
    stage.character.traverse((obj) => {
      if (isOutlineHull(obj)) expect(obj.visible).toBe(false);
    });
  });
});
