/**
 * A geometry-only stand-in for the browser's `Image` + `<canvas>` raster
 * path, for Node tests of canvas code (`lib/games/thumbnail.ts`): an Image
 * learns its size from the PNG/JPEG header of its data URL (or fails to load,
 * asynchronously, like a browser), and a canvas "encodes" a header-only JPEG
 * of its own size. `drawImage` rejects a source rectangle outside the image.
 * The mobile client runs the same ImageOps contract on a fake of its native
 * manipulator.
 */
import { fakeJpegBase64, readImageSize } from "@dodi/studio/ports.contract";
import { vi } from "vitest";

class FakeImage {
  width = 0;
  height = 0;
  naturalWidth = 0;
  naturalHeight = 0;
  onload: (() => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  private source = "";

  get src(): string {
    return this.source;
  }

  set src(value: string) {
    this.source = value;
    const size = value.startsWith("data:image/") ? readImageSize(value) : null;
    setTimeout(() => {
      if (!size) {
        this.onerror?.(new Event("error"));
        return;
      }
      this.width = this.naturalWidth = size.width;
      this.height = this.naturalHeight = size.height;
      this.onload?.();
    }, 0);
  }
}

class FakeCanvas {
  width = 300;
  height = 150;

  getContext(kind: string) {
    if (kind !== "2d") return null;
    return {
      fillStyle: "#000000",
      fillRect: () => {},
      drawImage: (image: FakeImage, ...args: number[]) => {
        if (args.length === 8) {
          const [sx, sy, sw, sh] = args;
          const isInside = sx >= 0 && sy >= 0 && sx + sw <= image.width && sy + sh <= image.height;
          if (!isInside) throw new Error("fake canvas: source rectangle outside the image");
        }
      },
    };
  }

  toDataURL(type = "image/png"): string {
    if (type !== "image/jpeg") throw new Error("fake canvas: JPEG only");
    return `data:image/jpeg;base64,${fakeJpegBase64(this.width, this.height)}`;
  }
}

/** Install the fake `Image` and `document.createElement("canvas")` as globals. */
export function installFakeCanvas(): void {
  vi.stubGlobal("Image", FakeImage);
  vi.stubGlobal("document", {
    createElement: (tag: string) => {
      if (tag !== "canvas") throw new Error(`fake document: no <${tag}>`);
      return new FakeCanvas();
    },
  });
}
