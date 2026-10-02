import { unzlibSync } from "fflate";

/**
 * A small PNG decoder for the textures embedded in character files (the face
 * atlas, decals): 8-bit greyscale, grey + alpha, RGB or RGBA, not interlaced,
 * which is what the Blender exporter writes. Runtimes without an image decoder
 * for script (React Native, Node) read the pixels with it; browsers use their own.
 */

export interface DecodedImage {
  width: number;
  height: number;
  /** RGBA, 8 bits per channel, rows top to bottom. */
  data: Uint8Array;
}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

// Colour type -> channels per pixel.
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 4: 2, 6: 4 };

function readUint32(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function chunkType(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/** Undo the per-row filters; returns the raw scanlines without their filter bytes. */
function unfilter(filtered: Uint8Array, width: number, height: number, bpp: number): Uint8Array {
  const stride = width * bpp;
  const out = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = filtered[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const row = y * stride;
    const prev = row - stride;
    const hasUp = y > 0;
    // One loop per filter type: this runs over every byte of the face atlas.
    switch (filter) {
      case 0:
        out.set(filtered.subarray(src, src + stride), row);
        break;
      case 1:
        for (let x = 0; x < stride; x++) {
          out[row + x] = (filtered[src + x] + (x >= bpp ? out[row + x - bpp] : 0)) & 0xff;
        }
        break;
      case 2:
        for (let x = 0; x < stride; x++) {
          out[row + x] = (filtered[src + x] + (hasUp ? out[prev + x] : 0)) & 0xff;
        }
        break;
      case 3:
        for (let x = 0; x < stride; x++) {
          const left = x >= bpp ? out[row + x - bpp] : 0;
          const up = hasUp ? out[prev + x] : 0;
          out[row + x] = (filtered[src + x] + ((left + up) >> 1)) & 0xff;
        }
        break;
      case 4:
        for (let x = 0; x < stride; x++) {
          const left = x >= bpp ? out[row + x - bpp] : 0;
          const up = hasUp ? out[prev + x] : 0;
          const upLeft = hasUp && x >= bpp ? out[prev + x - bpp] : 0;
          out[row + x] = (filtered[src + x] + paeth(left, up, upLeft)) & 0xff;
        }
        break;
      default:
        throw new Error(`PNG: unknown filter ${filter}`);
    }
  }
  return out;
}

export function decodePng(bytes: Uint8Array): DecodedImage {
  if (bytes.length < 8 || SIGNATURE.some((value, i) => bytes[i] !== value)) throw new Error("PNG: bad signature");
  let width = 0;
  let height = 0;
  let channels = 0;
  const idat: Uint8Array[] = [];
  let offset = 8;
  while (offset + 8 <= bytes.length) {
    const length = readUint32(bytes, offset);
    const type = chunkType(bytes, offset + 4);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = readUint32(data, 0);
      height = readUint32(data, 4);
      const bitDepth = data[8];
      const colorType = data[9];
      const interlace = data[12];
      channels = CHANNELS[colorType] ?? 0;
      if (bitDepth !== 8 || channels === 0 || interlace !== 0) {
        throw new Error(`PNG: unsupported format (depth ${bitDepth}, colour type ${colorType}, interlace ${interlace})`);
      }
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length; // length, type, data, CRC
  }
  if (width === 0 || height === 0 || idat.length === 0) throw new Error("PNG: missing image data");

  const compressed = new Uint8Array(idat.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of idat) {
    compressed.set(part, at);
    at += part.length;
  }
  const pixels = unfilter(unzlibSync(compressed), width, height, channels);
  if (channels === 4) return { width, height, data: pixels };

  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0, j = 0; i < width * height; i++, j += channels) {
    const isGrey = channels <= 2;
    rgba[i * 4] = pixels[j];
    rgba[i * 4 + 1] = isGrey ? pixels[j] : pixels[j + 1];
    rgba[i * 4 + 2] = isGrey ? pixels[j] : pixels[j + 2];
    rgba[i * 4 + 3] = channels === 2 ? pixels[j + 1] : 255;
  }
  return { width, height, data: rgba };
}
