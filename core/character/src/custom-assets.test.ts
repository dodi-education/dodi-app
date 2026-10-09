import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  accessorySocketOf,
  characterModelFor,
  customAssetIdOf,
  customAssetRef,
  isCustomAssetRef,
  withRigBones,
} from "./character-catalog";
import { parseCharacterFile } from "./character-files";
import { sanitizeLook } from "./character-look";
import { characterPoseFor } from "./character-pose";
import { CharacterStage } from "./character-stage";
import { CustomAssetError, addCustomAccessories, loadCustomAvatar } from "./custom-assets";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const read = (path: string): Uint8Array => new Uint8Array(readFileSync(REPO + path));
const AVATAR_ID = "6f1c1d1e-0000-4000-8000-000000000001";
const HAT_ID = "6f1c1d1e-0000-4000-8000-000000000002";

const files: Record<string, Uint8Array> = {
  [AVATAR_ID]: read("characters/dodi/dodi.glb"),
  [HAT_ID]: read("characters/accessories/party_hat/party_hat.glb"),
};
const getBytes = (id: string): Promise<Uint8Array> =>
  files[id] ? Promise.resolve(files[id]) : Promise.reject(new Error("gone"));

describe("custom asset refs", () => {
  it("round-trip ids", () => {
    const ref = customAssetRef(AVATAR_ID);
    expect(ref).toBe(`custom:${AVATAR_ID}`);
    expect(isCustomAssetRef(ref)).toBe(true);
    expect(customAssetIdOf(ref)).toBe(AVATAR_ID);
    expect(isCustomAssetRef("custom:nope")).toBe(false);
    expect(customAssetIdOf("dodi")).toBeNull();
  });

  it("describe a custom avatar as the stock rig with nothing to recolor", () => {
    const model = characterModelFor(customAssetRef(AVATAR_ID));
    expect(model.id).toBe(customAssetRef(AVATAR_ID));
    expect(model.customizable).toEqual([]);
    expect(model.bones).toContain("head");
    expect(withRigBones(model, ["root", "head"]).bones).toEqual(["root", "head"]);
  });

  it("know the sockets of catalog and custom accessories", () => {
    expect(accessorySocketOf("scarf")).toBe("socket_neck");
    expect(accessorySocketOf(customAssetRef(HAT_ID), new Map([[HAT_ID, "socket_head_top"]]))).toBe("socket_head_top");
    expect(accessorySocketOf(customAssetRef(HAT_ID))).toBeNull();
  });
});

describe("sanitizeLook with custom assets", () => {
  const raw = {
    model: `custom:${AVATAR_ID}`,
    colors: { skin: "#ff0000" },
    accessories: ["glasses", `custom:${HAT_ID}`, "custom:bad"],
  };

  it("keeps well-formed custom refs when it can't tell, and drops colors a custom avatar doesn't offer", () => {
    expect(sanitizeLook(raw)).toEqual({
      v: 1,
      model: `custom:${AVATAR_ID}`,
      colors: {},
      accessories: ["glasses", `custom:${HAT_ID}`],
    });
  });

  it("keeps known custom refs and falls back for unknown ones", () => {
    expect(sanitizeLook(raw, { customAssetIds: new Set([AVATAR_ID, HAT_ID]) }).model).toBe(`custom:${AVATAR_ID}`);
    const fallen = sanitizeLook(raw, { customAssetIds: new Set() });
    expect(fallen.model).toBe("dodi");
    expect(fallen.colors).toEqual({ skin: "#ff0000" });
    expect(fallen.accessories).toEqual(["glasses"]);
  });
});

describe("loading custom files from bytes", () => {
  it("loads a custom avatar and puts a custom accessory on it", async () => {
    const avatar = await loadCustomAvatar(customAssetRef(AVATAR_ID), getBytes);
    const stage = new CharacterStage(avatar, new Map());
    const hat = customAssetRef(HAT_ID);
    await addCustomAccessories(stage, ["glasses", hat], getBytes);
    expect(stage.hasAccessory(hat)).toBe(true);
    expect(stage.hasAccessory("glasses")).toBe(false); // catalog ones come with the stage
    expect(stage.isAccessoryShown(hat)).toBe(false);
    stage.setPose(characterPoseFor({ state: "active", isThinking: false, isSpeaking: false }), true);
    stage.applyLook({ colors: {}, accessories: [hat] });
    expect(stage.isAccessoryShown(hat)).toBe(true);
    // Loaded once per stage.
    await addCustomAccessories(stage, [hat], () => Promise.reject(new Error("not again")));
    expect(stage.hasAccessory(hat)).toBe(true);
  });

  it("refuses the wrong kind, and leaves a missing accessory off", async () => {
    await expect(loadCustomAvatar(customAssetRef(HAT_ID), getBytes)).rejects.toBeInstanceOf(CustomAssetError);
    const avatar = await loadCustomAvatar(customAssetRef(AVATAR_ID), getBytes);
    const stage = new CharacterStage(avatar, new Map());
    const gone = customAssetRef("6f1c1d1e-0000-4000-8000-00000000dead");
    await addCustomAccessories(stage, [gone, customAssetRef(AVATAR_ID)], getBytes);
    expect(stage.hasAccessory(gone)).toBe(false);
    expect(stage.hasAccessory(customAssetRef(AVATAR_ID))).toBe(false);
  });
});

describe("parseCharacterFile", () => {
  it("still parses catalog bytes", async () => {
    const file = await parseCharacterFile(read("characters/accessories/scarf/scarf.glb").slice().buffer);
    expect(file.scene).toBeTruthy();
  });
});
