import { describe, expect, it } from "vitest";

import { detectRasterImageType, rasterImageExtension } from "./raster-image";

const bytes = (...values: number[]): Uint8Array => new Uint8Array(values);
const text = (value: string): number[] => [...value].map((char) => char.charCodeAt(0));

describe("detectRasterImageType", () => {
  it("knows JPEG, PNG and WebP by their signatures", () => {
    expect(detectRasterImageType(bytes(0xff, 0xd8, 0xff, 0xe0, 0x00))).toBe("image/jpeg");
    expect(detectRasterImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00))).toBe(
      "image/png",
    );
    expect(detectRasterImageType(bytes(...text("RIFF"), 0, 0, 0, 0, ...text("WEBPVP8 ")))).toBe(
      "image/webp",
    );
  });

  it("refuses markup, other RIFF files and truncated headers", () => {
    expect(detectRasterImageType(bytes(...text("<svg xmlns")))).toBeNull();
    expect(detectRasterImageType(bytes(...text("<html>")))).toBeNull();
    expect(detectRasterImageType(bytes(...text("RIFF"), 0, 0, 0, 0, ...text("WAVE")))).toBeNull();
    expect(detectRasterImageType(bytes(0x89, 0x50, 0x4e))).toBeNull();
    expect(detectRasterImageType(bytes())).toBeNull();
  });
});

describe("rasterImageExtension", () => {
  it("names the file extension of each type", () => {
    expect(rasterImageExtension("image/jpeg")).toBe("jpg");
    expect(rasterImageExtension("image/png")).toBe("png");
    expect(rasterImageExtension("image/webp")).toBe("webp");
  });
});
