import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { validateCharacterAsset, type CharacterAssetKind } from "./asset-validator";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const AVATAR = "characters/dodi/dodi.glb";
const ACCESSORY_FILES = ["glasses", "headphones", "party_hat", "scarf"].map(
  (name) => `characters/accessories/${name}/${name}.glb`,
);

function read(file: string): Uint8Array {
  return new Uint8Array(readFileSync(REPO + file));
}

type Doc = Record<string, unknown> & {
  nodes: Record<string, unknown>[];
  scenes: Record<string, unknown>[];
  animations?: Record<string, unknown>[];
  buffers: Record<string, unknown>[];
};

/** The file's glTF JSON and its binary chunk (with its header). */
function split(bytes: Uint8Array): { doc: Doc; rest: Uint8Array } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = view.getUint32(12, true);
  const doc = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength))) as Doc;
  return { doc, rest: bytes.subarray(20 + jsonLength) };
}

/** A .glb with an edited JSON chunk (and optional padding at the end). */
function rebuild(bytes: Uint8Array, edit: (doc: Doc) => void, extraBytes = 0): Uint8Array {
  const { doc, rest } = split(bytes);
  edit(doc);
  let json = new TextEncoder().encode(JSON.stringify(doc));
  const padded = Math.ceil(json.length / 4) * 4;
  if (padded !== json.length) {
    const p = new Uint8Array(padded).fill(0x20);
    p.set(json);
    json = p;
  }
  const total = 20 + json.length + rest.length + extraBytes;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, json.length, true);
  view.setUint32(16, 0x4e4f534a, true);
  out.set(json, 20);
  out.set(rest, 20 + json.length);
  return out;
}

const hasPython = (() => {
  try {
    execFileSync("python3", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

/** validate.py's verdict on bytes: its errors and warnings, as printed. */
function python(bytes: Uint8Array): { isValid: boolean; errors: string[]; warnings: string[] } {
  const dir = mkdtempSync(path.join(tmpdir(), "asset-validator-"));
  const file = path.join(dir, "asset.glb");
  writeFileSync(file, bytes);
  let output: string;
  let isValid = true;
  try {
    output = execFileSync("python3", [REPO + "characters/validate.py", file], { encoding: "utf8" });
  } catch (error) {
    isValid = false;
    output = String((error as { stdout?: unknown }).stdout ?? "");
  }
  const lines = output.split("\n");
  return {
    isValid,
    errors: lines.filter((l) => l.startsWith("  error: ")).map((l) => l.slice(9)),
    warnings: lines.filter((l) => l.startsWith("  warning: ")).map((l) => l.slice(11)),
  };
}

function expectSameAsPython(bytes: Uint8Array, kind: CharacterAssetKind): void {
  if (!hasPython) return;
  const ours = validateCharacterAsset(bytes, kind);
  const theirs = python(bytes);
  expect(ours.isValid).toBe(theirs.isValid);
  expect(ours.errors).toEqual(theirs.errors);
  expect(ours.warnings).toEqual(theirs.warnings);
}

describe("validateCharacterAsset on the stock files", () => {
  it("passes dodi as an avatar, with its rig, sockets and clips", () => {
    const report = validateCharacterAsset(read(AVATAR), "avatar");
    expect(report.errors).toEqual([]);
    expect(report.isValid).toBe(true);
    expect(report.info.bones).toEqual(expect.arrayContaining(["root", "body", "neck", "head", "jaw"]));
    expect(report.info.sockets).toEqual(
      expect.arrayContaining(["socket_head_top", "socket_eyes", "socket_ears", "socket_neck", "socket_back"]),
    );
    expect(report.info.clips).toEqual(["idle", "listen", "think", "talk", "sleep", "happy", "sad", "deaf"]);
    expect(report.info.triangles).toBe(17878);
    expect(report.info.bytes).toBe(read(AVATAR).length);
    expect(report.info.maxTexture).toBeGreaterThan(0);
    expect(report.info.maxTexture).toBeLessThanOrEqual(1024);
    expectSameAsPython(read(AVATAR), "avatar");
  });

  it.each(ACCESSORY_FILES)("passes %s as an accessory", (file) => {
    const report = validateCharacterAsset(read(file), "accessory");
    expect(report.errors).toEqual([]);
    expect(report.isValid).toBe(true);
    expect(report.info.socket).toMatch(/^socket_/);
    expect(report.info.triangles).toBeGreaterThan(0);
    expectSameAsPython(read(file), "accessory");
  });

  it("knows the triangle counts validate.py reports", () => {
    expect(validateCharacterAsset(read(ACCESSORY_FILES[0]), "accessory").info.triangles).toBe(2724);
    expect(validateCharacterAsset(read(ACCESSORY_FILES[3]), "accessory").info.triangles).toBe(6692);
  });
});

describe("validateCharacterAsset on broken files", () => {
  it("refuses a truncated file", () => {
    const report = validateCharacterAsset(read(AVATAR).subarray(0, 4000), "avatar");
    expect(report.isValid).toBe(false);
    expect(report.errors[0]).toMatch(/truncated/);
    expect(validateCharacterAsset(new Uint8Array(10), "avatar").isValid).toBe(false);
  });

  it("refuses a file that is not a .glb", () => {
    const bytes = read(AVATAR).slice();
    bytes[0] = 0x00;
    expect(validateCharacterAsset(bytes, "avatar").errors).toEqual(["not a glTF 2.0 binary (.glb)"]);
    expect(validateCharacterAsset(new TextEncoder().encode('{"asset":{}} padding padding'), "accessory").isValid).toBe(
      false,
    );
  });

  it("refuses a file over the budget, as validate.py does", () => {
    const big = rebuild(read(ACCESSORY_FILES[0]), () => {}, 1024 * 1024);
    const report = validateCharacterAsset(big, "accessory");
    expect(report.isValid).toBe(false);
    expect(report.errors.some((e) => e.includes("over the accessory budget of 1024 KB"))).toBe(true);
    expectSameAsPython(big, "accessory");

    const bigAvatar = rebuild(read(AVATAR), () => {}, 3 * 1024 * 1024);
    expect(validateCharacterAsset(bigAvatar, "avatar").errors).toContain(
      `file is ${(bigAvatar.length / 1e6).toFixed(1)} MB, over the 3 MB budget`,
    );
    expectSameAsPython(bigAvatar, "avatar");
  });

  it("refuses an avatar without a head bone or an idle clip, as validate.py does", () => {
    const bytes = rebuild(read(AVATAR), (doc) => {
      for (const node of doc.nodes) if (node.name === "head") node.name = "noggin";
      for (const anim of doc.animations ?? []) if (anim.name === "idle") anim.name = "chill";
    });
    const report = validateCharacterAsset(bytes, "avatar");
    expect(report.errors).toEqual(
      expect.arrayContaining(["missing required bone 'head'", "no 'idle' animation"]),
    );
    expectSameAsPython(bytes, "avatar");
  });

  it("refuses an accessory whose attach point is turned, as validate.py does", () => {
    const bytes = rebuild(read(ACCESSORY_FILES[1]), (doc) => {
      for (const node of doc.nodes) if (node.name === "attach") node.rotation = [0, 0.7071, 0, 0.7071];
    });
    expect(validateCharacterAsset(bytes, "accessory").errors).toEqual([
      "'attach' must sit at the accessory's origin with no rotation",
    ]);
    expectSameAsPython(bytes, "accessory");
  });

  it("refuses the wrong kind", () => {
    expect(validateCharacterAsset(read(AVATAR), "accessory").errors[0]).toBe("this is a character, not an accessory");
    expect(validateCharacterAsset(read(ACCESSORY_FILES[0]), "avatar").errors[0]).toBe(
      "this is an accessory, not a character",
    );
  });

  it("refuses files that would make the loader fetch or need more", () => {
    const bytes = rebuild(read(ACCESSORY_FILES[0]), (doc) => {
      doc.buffers[0].uri = "https://example.com/x.bin";
      doc.extensionsRequired = ["KHR_draco_mesh_compression"];
    });
    const errors = validateCharacterAsset(bytes, "accessory").errors;
    expect(errors).toContain("buffer 0 points outside the file (uri); embed it in the .glb");
    expect(errors).toContain("requires glTF extensions the app can't load: KHR_draco_mesh_compression");
  });
});
