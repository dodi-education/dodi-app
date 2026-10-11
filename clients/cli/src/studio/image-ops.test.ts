import { encode as encodePng } from "fast-png";
import jpeg from "jpeg-js";
import { describe, expect, it } from "vitest";

import { decodeImage, nodeImageOps } from "./image-ops";

function pngDataUrl(width: number, height: number, rgba: [number, number, number, number]): string {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set(rgba, i * 4);
  return `data:image/png;base64,${Buffer.from(encodePng({ width, height, data, channels: 4 })).toString("base64")}`;
}

function jpegDataUrl(width: number, height: number): string {
  const data = Buffer.alloc(width * height * 4, 200);
  return `data:image/jpeg;base64,${Buffer.from(jpeg.encode({ data, width, height }, 90).data).toString("base64")}`;
}

describe("Node image ops", () => {
  it("downscales a PNG into a bounded JPEG, keeping the aspect ratio", async () => {
    const out = await nodeImageOps.downscale(pngDataUrl(800, 1000, [10, 120, 200, 255]), {
      maxWidth: 400,
      maxHeight: 400,
      quality: 0.8,
    });
    expect(out).toMatch(/^data:image\/jpeg;base64,/);
    const image = decodeImage(out!)!;
    expect([image.width, image.height]).toEqual([320, 400]);
    expect(Math.abs(image.data[2] - 200)).toBeLessThan(8);
  });

  it("never enlarges", async () => {
    const image = decodeImage((await nodeImageOps.downscale(jpegDataUrl(100, 50), { maxWidth: 768, maxHeight: 960, quality: 0.8 }))!)!;
    expect([image.width, image.height]).toEqual([100, 50]);
  });

  it("cuts the centered square list preview", async () => {
    const image = decodeImage((await nodeImageOps.squareThumbnail(pngDataUrl(1024, 768, [255, 0, 0, 255]), 100))!)!;
    expect([image.width, image.height]).toEqual([100, 100]);
  });

  it("flattens transparency onto white", async () => {
    const image = decodeImage((await nodeImageOps.downscale(pngDataUrl(4, 4, [0, 0, 0, 0]), { maxWidth: 4, maxHeight: 4, quality: 0.9 }))!)!;
    expect(image.data[0]).toBeGreaterThan(240);
  });

  it("trusts the bytes over a wrong label, and reads anything else as unreadable", async () => {
    const mislabelled = jpegDataUrl(20, 20).replace("image/jpeg", "image/png");
    expect(decodeImage(mislabelled)).not.toBeNull();
    expect(await nodeImageOps.downscale("data:image/webp;base64,UklGRg==", { maxWidth: 1, maxHeight: 1, quality: 1 })).toBeNull();
    expect(await nodeImageOps.downscale("not a data url", { maxWidth: 1, maxHeight: 1, quality: 1 })).toBeNull();
  });
});
