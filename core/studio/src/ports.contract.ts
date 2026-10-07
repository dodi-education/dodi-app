/**
 * Behavioural contracts for the studio ports both clients implement
 * (`ports.ts`). Each client runs the same suite against its own adapter (web:
 * vitest in clients/web, mobile: vitest in clients/mobile with the native
 * modules faked), so the two adapters can't drift in what the build relies on.
 *
 * The cases describe what `build-runner` / `build-manager` / the screenshot
 * service need from a port, never how an adapter stores or computes it.
 *
 * Also exported: tiny image helpers both clients' fake raster engines share
 * (a real, decodable grayscale PNG for fixtures; a header-only JPEG for fake
 * encoder output; a header reader for both).
 */

import { describe, expect, it } from "vitest";

import type { CheckpointStore, ImageOps } from "./ports";

/** How a contract gets instances of the port under test. */
export interface PortHarness<T> {
  /** A fresh instance over empty device storage. */
  create(): T | Promise<T>;
  /**
   * A second instance over the storage of the last `create()`, as after an app
   * restart or a page reload. Omit where the adapter can't be re-created; the
   * persistence case is then skipped.
   */
  reopen?(): T | Promise<T>;
}

// ---------------------------------------------------------------------------
// CheckpointStore
// ---------------------------------------------------------------------------

const GAME_A = "0b7e2d1c-5f43-4c8a-9e1b-6a2f3d4c5b6a";
const GAME_B = "f1e2d3c4-b5a6-4978-8a9b-0c1d2e3f4a5b";

/** A stand-in for a vault-sealed checkpoint record (an `enc:v1:` string). */
function sealedRecord(tag: string, length = 64): string {
  const body = (tag + "-").repeat(Math.ceil(length / (tag.length + 1))).slice(0, length);
  return `enc:v1:${body}`;
}

export function describeCheckpointStoreContract(
  name: string,
  harness: PortHarness<CheckpointStore>,
): void {
  describe(`CheckpointStore contract: ${name}`, () => {
    it("load resolves null for a game without a checkpoint", async () => {
      const store = await harness.create();
      await expect(store.load(GAME_A)).resolves.toBeNull();
    });

    it("load returns exactly the sealed string that was saved", async () => {
      const store = await harness.create();
      const sealed = sealedRecord("first");
      await store.save(GAME_A, sealed);
      await expect(store.load(GAME_A)).resolves.toBe(sealed);
    });

    it("a later save replaces the earlier checkpoint", async () => {
      const store = await harness.create();
      await store.save(GAME_A, sealedRecord("old"));
      await store.save(GAME_A, sealedRecord("new", 10));
      await expect(store.load(GAME_A)).resolves.toBe(sealedRecord("new", 10));
    });

    it("clear removes the checkpoint", async () => {
      const store = await harness.create();
      await store.save(GAME_A, sealedRecord("gone"));
      await store.clear(GAME_A);
      await expect(store.load(GAME_A)).resolves.toBeNull();
    });

    it("clear resolves for a game that has no checkpoint", async () => {
      const store = await harness.create();
      await expect(store.clear(GAME_A)).resolves.toBeUndefined();
    });

    it("keeps one checkpoint per game", async () => {
      const store = await harness.create();
      await Promise.all([
        store.save(GAME_A, sealedRecord("a")),
        store.save(GAME_B, sealedRecord("b")),
      ]);
      await store.clear(GAME_A);
      await expect(store.load(GAME_A)).resolves.toBeNull();
      await expect(store.load(GAME_B)).resolves.toBe(sealedRecord("b"));
    });

    it("round-trips a large record (a transcript with screenshots)", async () => {
      const store = await harness.create();
      const sealed = sealedRecord("big", 3 * 1024 * 1024);
      await store.save(GAME_A, sealed);
      const loaded = await store.load(GAME_A);
      expect(loaded?.length).toBe(sealed.length);
      expect(loaded === sealed).toBe(true);
    });

    it.skipIf(!harness.reopen)("survives a restart (a new instance over the same storage)", async () => {
      const store = await harness.create();
      await store.save(GAME_A, sealedRecord("kept"));
      const reopened = await harness.reopen!();
      await expect(reopened.load(GAME_A)).resolves.toBe(sealedRecord("kept"));
      await reopened.clear(GAME_A);
      await expect((await harness.reopen!()).load(GAME_A)).resolves.toBeNull();
    });
  });
}

// ---------------------------------------------------------------------------
// Image fixtures shared by the clients' fake raster engines
// ---------------------------------------------------------------------------

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Standard (padded) base64 of `bytes`. */
export function encodeBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const n = (a << 16) | (b << 8) | c;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63] : "=";
    out += i + 2 < bytes.length ? B64[n & 63] : "=";
  }
  return out;
}

/** Lenient base64 decode (skips characters outside the alphabet, like most native decoders). */
export function decodeBase64(text: string): Uint8Array<ArrayBuffer> {
  const clean = text.replace(/[^A-Za-z0-9+/]/g, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let bits = 0;
  let value = 0;
  let o = 0;
  for (const ch of clean) {
    value = (value << 6) | B64.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (value >> bits) & 0xff;
    }
  }
  return out.slice(0, o);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u32(n: number): number[] {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

function pngChunk(type: string, data: Uint8Array): number[] {
  const typed = new Uint8Array(4 + data.length);
  for (let i = 0; i < 4; i++) typed[i] = type.charCodeAt(i);
  typed.set(data, 4);
  return [...u32(data.length), ...typed, ...u32(crc32(typed))];
}

/** zlib stream with stored (uncompressed) deflate blocks. */
function zlibStored(raw: Uint8Array): Uint8Array {
  const out: number[] = [0x78, 0x01];
  for (let i = 0; i < raw.length || i === 0; i += 0xffff) {
    const block = raw.subarray(i, Math.min(raw.length, i + 0xffff));
    const isLast = i + 0xffff >= raw.length;
    out.push(isLast ? 1 : 0, block.length & 0xff, block.length >> 8);
    out.push(~block.length & 0xff, (~block.length >> 8) & 0xff);
    for (const b of block) out.push(b);
    if (isLast) break;
  }
  let a = 1;
  let b = 0;
  for (const byte of raw) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  out.push(...u32(((b << 16) | a) >>> 0));
  return new Uint8Array(out);
}

/** A real, decodable grayscale PNG (a horizontal gradient) as a data URL. */
export function testPngDataUrl(width: number, height: number): string {
  const raw = new Uint8Array(height * (width + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width + 1)] = 0; // filter: none
    for (let x = 0; x < width; x++) raw[y * (width + 1) + 1 + x] = Math.floor((x / width) * 255);
  }
  const ihdr = new Uint8Array([...u32(width), ...u32(height), 8, 0, 0, 0, 0]);
  const bytes = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...pngChunk("IHDR", ihdr),
    ...pngChunk("IDAT", zlibStored(raw)),
    ...pngChunk("IEND", new Uint8Array(0)),
  ]);
  return `data:image/png;base64,${encodeBase64(bytes)}`;
}

/**
 * Header-only baseline JPEG (SOI, SOF0, EOI) of the given size: what a fake
 * encoder hands back so the contract can read the output's dimensions.
 */
export function fakeJpegBase64(width: number, height: number): string {
  const sof = [0xff, 0xc0, 0x00, 0x0b, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x01, 0x01, 0x11, 0x00];
  return encodeBase64(new Uint8Array([0xff, 0xd8, ...sof, 0xff, 0xd9]));
}

export interface ImageSize {
  format: "png" | "jpeg";
  width: number;
  height: number;
}

/** Format and pixel size from a PNG/JPEG header (bytes, base64 or a data URL); null when unreadable. */
export function readImageSize(input: Uint8Array | string): ImageSize | null {
  const bytes =
    typeof input === "string" ? decodeBase64(input.startsWith("data:") ? input.slice(input.indexOf(",") + 1) : input) : input;
  const be32 = (at: number): number => ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    const width = be32(16);
    const height = be32(20);
    return width > 0 && height > 0 ? { format: "png", width, height } : null;
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let at = 2;
    while (at + 9 < bytes.length && bytes[at] === 0xff) {
      const marker = bytes[at + 1];
      const length = (bytes[at + 2] << 8) | bytes[at + 3];
      const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof) {
        const height = (bytes[at + 5] << 8) | bytes[at + 6];
        const width = (bytes[at + 7] << 8) | bytes[at + 8];
        return width > 0 && height > 0 ? { format: "jpeg", width, height } : null;
      }
      at += 2 + length;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// ImageOps
// ---------------------------------------------------------------------------

const JPEG_DATA_URL = /^data:image\/jpeg;base64,/;

function jpegSize(dataUrl: string | null): ImageSize {
  expect(dataUrl).toMatch(JPEG_DATA_URL);
  const size = readImageSize(dataUrl!);
  expect(size?.format).toBe("jpeg");
  return size!;
}

const UNREADABLE = [
  ["a string that is no data URL", "not an image"],
  ["a data URL whose bytes are no image", "data:image/png;base64,bm90IGFuIGltYWdlIGF0IGFsbA=="],
] as const;

export function describeImageOpsContract(name: string, harness: PortHarness<ImageOps>): void {
  describe(`ImageOps contract: ${name}`, () => {
    describe("downscale", () => {
      it("bounds a landscape image by its width, keeping the aspect ratio, as a JPEG data URL", async () => {
        const ops = await harness.create();
        const out = await ops.downscale(testPngDataUrl(400, 300), { maxWidth: 200, maxHeight: 200, quality: 0.7 });
        expect(jpegSize(out)).toMatchObject({ width: 200, height: 150 });
      });

      it("bounds a portrait image by its height", async () => {
        const ops = await harness.create();
        const out = await ops.downscale(testPngDataUrl(300, 600), { maxWidth: 200, maxHeight: 200, quality: 0.7 });
        expect(jpegSize(out)).toMatchObject({ width: 100, height: 200 });
      });

      it("rounds to whole pixels and never exceeds the bound", async () => {
        const ops = await harness.create();
        const out = await ops.downscale(testPngDataUrl(333, 101), { maxWidth: 100, maxHeight: 100, quality: 0.5 });
        const size = jpegSize(out);
        expect(size.width).toBeLessThanOrEqual(100);
        expect(size.height).toBeLessThanOrEqual(100);
        expect(size).toMatchObject({ width: 100, height: 30 });
      });

      it("never upscales an image that already fits", async () => {
        const ops = await harness.create();
        const out = await ops.downscale(testPngDataUrl(120, 80), { maxWidth: 240, maxHeight: 300, quality: 0.7 });
        expect(jpegSize(out)).toMatchObject({ width: 120, height: 80 });
      });

      it.each(UNREADABLE)("resolves null (never rejects) for %s", async (_label, input) => {
        const ops = await harness.create();
        await expect(ops.downscale(input, { maxWidth: 100, maxHeight: 100, quality: 0.7 })).resolves.toBeNull();
      });
    });

    describe("squareThumbnail", () => {
      it("turns a landscape image into a size×size JPEG", async () => {
        const ops = await harness.create();
        const out = await ops.squareThumbnail(testPngDataUrl(400, 300), 100);
        expect(jpegSize(out)).toMatchObject({ width: 100, height: 100 });
      });

      it("turns a portrait image into a size×size JPEG", async () => {
        const ops = await harness.create();
        const out = await ops.squareThumbnail(testPngDataUrl(300, 500), 64);
        expect(jpegSize(out)).toMatchObject({ width: 64, height: 64 });
      });

      it("is exactly size×size even for an image smaller than size", async () => {
        const ops = await harness.create();
        const out = await ops.squareThumbnail(testPngDataUrl(50, 40), 100);
        expect(jpegSize(out)).toMatchObject({ width: 100, height: 100 });
      });

      it.each(UNREADABLE)("resolves null (never rejects) for %s", async (_label, input) => {
        const ops = await harness.create();
        await expect(ops.squareThumbnail(input, 100)).resolves.toBeNull();
      });
    });
  });
}
