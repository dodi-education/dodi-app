/**
 * The studio's raster work in Node (web: canvas, mobile: the native image
 * manipulator): downscale a picture into a bounded JPEG and cut the square
 * list preview. Pure JavaScript codecs (PNG via fast-png, JPEG via jpeg-js),
 * bundled into the CLI, so `npm i -g` needs no native build. The providers
 * and the screenshot service deliver PNG or JPEG; anything else reads as
 * "can't be read" (null), which the studio already handles.
 */
import { decode as decodePng } from "fast-png";
import jpeg from "jpeg-js";

import type { ImageBound, ImageOps } from "@dodi/studio/ports";

export interface Rgba {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel. */
  data: Uint8Array;
}

function parseDataUrl(dataUrl: string): { mime: string; bytes: Uint8Array } | null {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(dataUrl);
  if (!match) return null;
  return { mime: match[1].toLowerCase(), bytes: new Uint8Array(Buffer.from(match[2], "base64")) };
}

function isPng(bytes: Uint8Array): boolean {
  return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes[0] === 0xff && bytes[1] === 0xd8;
}

/** Decode a PNG or JPEG data URL into RGBA; null when it is neither or broken. */
export function decodeImage(dataUrl: string): Rgba | null {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return null;
  try {
    // Trust the bytes, not the label: providers mislabel JPEGs as PNG.
    if (isPng(parsed.bytes)) return pngToRgba(parsed.bytes);
    if (isJpeg(parsed.bytes)) {
      const out = jpeg.decode(parsed.bytes, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 512 });
      return { width: out.width, height: out.height, data: new Uint8Array(out.data) };
    }
  } catch {
    return null;
  }
  return null;
}

function pngToRgba(bytes: Uint8Array): Rgba {
  const png = decodePng(bytes);
  const { width, height, channels } = png;
  const src = png.data;
  const max = png.depth === 16 ? 65535 : 255;
  const scale = (v: number) => (max === 255 ? v : Math.round((v / max) * 255));
  const out = new Uint8Array(width * height * 4);
  if (png.palette) {
    const palette = png.palette as number[][];
    for (let i = 0; i < width * height; i++) {
      const entry = palette[src[i]] ?? [0, 0, 0, 255];
      out.set([entry[0], entry[1], entry[2], entry[3] ?? 255], i * 4);
    }
    return { width, height, data: out };
  }
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    const s = i * channels;
    if (channels >= 3) {
      out[o] = scale(src[s]);
      out[o + 1] = scale(src[s + 1]);
      out[o + 2] = scale(src[s + 2]);
      out[o + 3] = channels === 4 ? scale(src[s + 3]) : 255;
    } else {
      const g = scale(src[s]);
      out[o] = g;
      out[o + 1] = g;
      out[o + 2] = g;
      out[o + 3] = channels === 2 ? scale(src[s + 1]) : 255;
    }
  }
  return { width, height, data: out };
}

/** Area-average resample (good quality for downscaling; never used to enlarge). */
export function resize(image: Rgba, width: number, height: number): Rgba {
  if (width === image.width && height === image.height) return image;
  const out = new Uint8Array(width * height * 4);
  const xRatio = image.width / width;
  const yRatio = image.height / height;
  for (let y = 0; y < height; y++) {
    const y0 = Math.floor(y * yRatio);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * yRatio));
    for (let x = 0; x < width; x++) {
      const x0 = Math.floor(x * xRatio);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * xRatio));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let yy = y0; yy < y1 && yy < image.height; yy++) {
        for (let xx = x0; xx < x1 && xx < image.width; xx++) {
          const i = (yy * image.width + xx) * 4;
          r += image.data[i];
          g += image.data[i + 1];
          b += image.data[i + 2];
          a += image.data[i + 3];
          n++;
        }
      }
      const o = (y * width + x) * 4;
      out[o] = r / n;
      out[o + 1] = g / n;
      out[o + 2] = b / n;
      out[o + 3] = a / n;
    }
  }
  return { width, height, data: out };
}

/** Center-crop the largest square. */
export function cropSquare(image: Rgba): Rgba {
  const side = Math.min(image.width, image.height);
  const left = Math.floor((image.width - side) / 2);
  const top = Math.floor((image.height - side) / 2);
  const out = new Uint8Array(side * side * 4);
  for (let y = 0; y < side; y++) {
    const from = ((top + y) * image.width + left) * 4;
    out.set(image.data.subarray(from, from + side * 4), y * side * 4);
  }
  return { width: side, height: side, data: out };
}

/** JPEG data URL; transparency is flattened onto white, as a canvas JPEG export does. */
export function encodeJpeg(image: Rgba, quality: number): string {
  const data = Buffer.alloc(image.data.length);
  for (let i = 0; i < image.data.length; i += 4) {
    const alpha = image.data[i + 3] / 255;
    data[i] = image.data[i] * alpha + 255 * (1 - alpha);
    data[i + 1] = image.data[i + 1] * alpha + 255 * (1 - alpha);
    data[i + 2] = image.data[i + 2] * alpha + 255 * (1 - alpha);
    data[i + 3] = 255;
  }
  const encoded = jpeg.encode({ data, width: image.width, height: image.height }, Math.round(quality * 100));
  return `data:image/jpeg;base64,${Buffer.from(encoded.data).toString("base64")}`;
}

/** Fit inside the bound, keeping the aspect ratio, never enlarging. */
export function fitWithin(width: number, height: number, maxWidth: number, maxHeight: number) {
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export const nodeImageOps: ImageOps = {
  async downscale(dataUrl: string, bound: ImageBound): Promise<string | null> {
    const image = decodeImage(dataUrl);
    if (!image) return null;
    const size = fitWithin(image.width, image.height, bound.maxWidth, bound.maxHeight);
    return encodeJpeg(resize(image, size.width, size.height), bound.quality);
  },
  async squareThumbnail(dataUrl: string, size: number): Promise<string | null> {
    const image = decodeImage(dataUrl);
    if (!image) return null;
    const square = cropSquare(image);
    const edge = Math.min(size, square.width);
    return encodeJpeg(resize(square, edge, edge), 0.85);
  },
};
