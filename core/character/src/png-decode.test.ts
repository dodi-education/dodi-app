import { zlibSync } from "fflate";
import { describe, expect, it } from "vitest";

import { decodePng } from "./png-decode";

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  return out; // CRC left zero: the decoder does not check it
}

/** A PNG of `rows` (each with its filter byte first). */
function png(width: number, height: number, colorType: number, rows: number[][]): Uint8Array {
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = colorType;
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlibSync(new Uint8Array(rows.flat()))),
    chunk("IEND", new Uint8Array()),
  ];
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

describe("decodePng", () => {
  it("undoes every row filter of an RGBA image", () => {
    // 2x5 px; row y uses filter y. Every decoded pixel should be (10, 20, 30, 255).
    const pixel = [10, 20, 30, 255];
    const rows = [
      [0, ...pixel, ...pixel],
      [1, ...pixel, 0, 0, 0, 0], // sub: same as the left pixel
      [2, 0, 0, 0, 0, 0, 0, 0, 0], // up
      [3, 5, 10, 15, 128, 0, 0, 0, 0], // average of left and up
      [4, 0, 0, 0, 0, 0, 0, 0, 0], // paeth picks up (= left = up-left)
    ];
    const image = decodePng(png(2, 5, 6, rows));
    expect(image.width).toBe(2);
    expect(image.height).toBe(5);
    for (let i = 0; i < 10; i++) expect([...image.data.subarray(i * 4, i * 4 + 4)]).toEqual(pixel);
  });

  it("expands RGB and grey to RGBA", () => {
    expect([...decodePng(png(1, 1, 2, [[0, 1, 2, 3]])).data]).toEqual([1, 2, 3, 255]);
    expect([...decodePng(png(1, 1, 4, [[0, 9, 99]])).data]).toEqual([9, 9, 9, 99]);
  });

  it("refuses what it does not read", () => {
    expect(() => decodePng(new Uint8Array([1, 2, 3]))).toThrow("signature");
    expect(() => decodePng(png(1, 1, 3, [[0, 0]]))).toThrow("unsupported");
  });
});
